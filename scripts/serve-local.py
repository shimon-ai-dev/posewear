"""Serve the local preview, asset library, and existing private 3090 media client."""

import argparse
import asyncio
import base64
from email import policy
from email.parser import BytesParser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import os
from pathlib import Path
import re
import sqlite3
from tempfile import TemporaryDirectory
from threading import Lock

from local_assets import AssetLibrary, MAX_IMAGE_BYTES, image_mime

DEFAULT_TRANSPORT = Path.home() / '.local/share/openbot-private-media/media_transport.py'
DEFAULT_ASSETS = Path.home() / 'Library/Application Support/PoseWear/assets.sqlite3'
QWEN = '/api/local-qwen/'
ASSETS = '/api/local-assets'
FACE_BASES = '/api/local-face-bases'
PARTS = '/api/local-parts'
MODEL = 'qwen-image-2.1'
REFERENCE_BYTES = 10 * 1024 * 1024
IMAGE_SUFFIX = {'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp'}


class RequestError(ValueError):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def multipart(body, content_type):
    message = BytesParser(policy=policy.default).parsebytes(
        f'Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n'.encode() + body)
    if not message.is_multipart():
        raise RequestError(400, '表单格式无效。')
    fields, files = {}, {}
    for part in message.iter_parts():
        name = part.get_param('name', header='content-disposition')
        data = part.get_payload(decode=True)
        if not isinstance(name, str) or data is None:
            raise RequestError(400, '表单字段无效。')
        if part.get_filename() is None:
            fields[name] = data.decode('utf-8')
        else:
            files.setdefault(name, []).append(data)
    return fields, files


async def check_media(transport, directory):
    return await transport.media_3090_status(transport.client(directory=directory))


async def generate_image(transport, directory, prompt, width, height, refs):
    client = transport.client(directory=directory)
    try:
        result = await client.generate('image', prompt, width=width, height=height,
                                       references=refs, timeout=105)
        return Path(result).read_bytes()
    finally:
        await client.close()


class PreviewServer(ThreadingHTTPServer):
    request_queue_size = 64


class PreviewHandler(SimpleHTTPRequestHandler):
    def valid_host(self):
        port = self.server.server_port
        return self.headers.get('Host') in {f'localhost:{port}', f'127.0.0.1:{port}'}

    def reply(self, status, data, mime):
        try:
            self.send_response(status)
            self.send_header('Content-Type', mime)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def json_reply(self, status, data):
        self.reply(status, json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode(),
                   'application/json; charset=utf-8')

    def body(self, limit):
        try:
            size = int(self.headers.get('Content-Length', ''))
        except ValueError:
            size = 0
        if not 0 < size <= limit:
            raise RequestError(413, '请求为空或超过大小限制。')
        body = self.rfile.read(size)
        if len(body) != size:
            raise RequestError(400, '上传未完成。')
        return body

    def do_GET(self):
        if not self.valid_host():
            return self.send_error(403)
        if self.path == QWEN + 'status':
            return self.json_reply(200, {'enabled': self.server.transport is not None})
        for prefix, library in self.server.libraries.items():
            if self.path == prefix:
                try:
                    return self.json_reply(200, {'people': library.list()})
                except sqlite3.Error:
                    return self.json_reply(500, {'message': '无法读取本地资产库。'})
            match = re.fullmatch(prefix + '/image/([0-9a-f]{32})', self.path)
            if match:
                asset = library.image(match.group(1))
                if asset is None:
                    return self.send_error(404)
                return self.reply(200, asset['content'], asset['mime'])
        try:
            return super().do_GET()
        except (BrokenPipeError, ConnectionResetError):
            return None

    def do_POST(self):
        if not self.valid_host() or self.headers.get('Origin') != 'http://' + self.headers['Host']:
            return self.json_reply(403, {'message': '此接口只接受本机预览页面的请求。'})
        try:
            for prefix, library in self.server.libraries.items():
                if self.path == prefix or self.path.startswith(prefix + '/'):
                    return self.update_library(library, self.path[len(prefix):], prefix != ASSETS)
            if self.path in {QWEN + 'check', QWEN + 'generate'}:
                return self.qwen()
            return self.json_reply(404, {'message': '接口不存在。'})
        except RequestError as error:
            return self.json_reply(error.status, {'message': str(error)})
        except (json.JSONDecodeError, UnicodeError):
            return self.json_reply(400, {'message': '请求格式无效。'})
        except ValueError as error:
            return self.json_reply(400, {'message': str(error)})
        except sqlite3.Error:
            return self.json_reply(500, {'message': '无法写入本地资产库。'})

    def update_library(self, library, suffix, references_only):
        if suffix == '':
            fields, files = multipart(self.body(MAX_IMAGE_BYTES + 16384), self.headers.get('Content-Type', ''))
            images = files.get('image', [])
            if len(images) != 1:
                raise RequestError(400, '请选择一张图片。')
            if references_only and fields.get('kind') != 'reference':
                raise RequestError(400, '此素材库仅接受上传图片。')
            return self.json_reply(200, {'id': library.save(fields, images[0])})
        if suffix not in ('/people', '/labels', '/tags'):
            raise RequestError(404, '接口不存在。')
        data = json.loads(self.body(16384))
        if not isinstance(data, dict):
            raise RequestError(400, '请求格式无效。')
        if suffix == '/people':
            return self.json_reply(200, {'id': library.create_person(data.get('name'))})
        if suffix == '/labels':
            return self.json_reply(200, {'id': library.create_label(data.get('person'), data.get('name'))})
        if not library.update_tags(data.get('id'), data.get('labels')):
            raise RequestError(404, '资产不存在。')
        return self.json_reply(200, {'ok': True})

    def qwen(self):
        transport = self.server.transport
        if transport is None:
            return self.json_reply(503, {'message': '本机私有 3090 客户端不可用。'})
        check = self.path.endswith('/check')
        if not self.server.gpu_request.acquire(blocking=False):
            return self.json_reply(409, {'message': '本机已有一个 3090 请求在处理。'})
        try:
            with TemporaryDirectory(prefix='posewear-media-') as directory:
                if check:
                    asyncio.run(check_media(transport, directory))
                    return self.json_reply(200, {'model': MODEL})
                return self.generate(transport, Path(directory))
        except (RequestError, ValueError):
            raise
        except Exception as error:
            operation = re.search(r'\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b', str(error))
            message = ('无法连接私有媒体网关。' if check else '3090 未确认图片结果，请先核实工作台和 Resident 状态。')
            if operation:
                message += ' 任务编号 ' + operation.group()
            return self.json_reply(502, {'message': message})
        finally:
            self.server.gpu_request.release()

    def generate(self, transport, directory):
        body = self.body(4 * REFERENCE_BYTES + 65536)
        kind = self.headers.get_content_type()
        if kind == 'application/json':
            fields, refs = json.loads(body), []
        elif kind == 'multipart/form-data':
            fields, files = multipart(body, self.headers['Content-Type'])
            refs = files.get('image[]', [])
        else:
            raise RequestError(415, '请选择受支持的图片请求格式。')
        if not isinstance(fields, dict):
            raise RequestError(400, '生图参数无效。')
        prompt, size = fields.get('prompt'), fields.get('size', '1024x1024')
        dimensions = re.fullmatch(r'([0-9]{3,4})x([0-9]{3,4})', str(size))
        if not isinstance(prompt, str) or not 0 < len(prompt.strip()) <= 16000 or not dimensions:
            raise RequestError(400, '请检查提示词和画幅尺寸。')
        width, height = map(int, dimensions.groups())
        if any(v < 256 or v > 2048 or v % 32 for v in (width, height)) or width * height > 4194304:
            raise RequestError(400, '请选择受支持的画幅尺寸。')
        if len(refs) > 4 or any(len(data) > REFERENCE_BYTES for data in refs):
            raise RequestError(400, '最多支持 4 张参考图，每张不超过 10 MiB。')
        paths = []
        for index, data in enumerate(refs):
            path = directory / f'reference-{index}{IMAGE_SUFFIX[image_mime(data)]}'
            path.write_bytes(data)
            paths.append(path)
        result = asyncio.run(generate_image(transport, directory, prompt, width, height, paths))
        encoded = base64.b64encode(result).decode('ascii')
        return self.json_reply(200, {'data': [{'b64_json': encoded}]})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8788)
    parser.add_argument('--directory', type=Path, default=Path(__file__).resolve().parents[1] / 'dist')
    parser.add_argument('--asset-db', type=Path, default=DEFAULT_ASSETS)
    parser.add_argument('--media-transport', type=Path, default=os.environ.get('POSEWEAR_MEDIA_TRANSPORT', DEFAULT_TRANSPORT))
    args = parser.parse_args()
    if not (args.directory / 'index.html').is_file():
        parser.error('Build the preview first.')

    transport = None
    if args.media_transport.is_file():
        spec = importlib.util.spec_from_file_location('posewear_media_transport', args.media_transport)
        transport = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(transport)
        except ModuleNotFoundError:
            parser.error('Start with npm run serve:3090 to use the installed media client.')

    handler = partial(PreviewHandler, directory=str(args.directory.resolve()))
    with PreviewServer(('127.0.0.1', args.port), handler) as server:
        server.libraries = {
            ASSETS: AssetLibrary(args.asset_db),
            FACE_BASES: AssetLibrary(args.asset_db.with_suffix('.face-bases.sqlite3')),
            PARTS: AssetLibrary(args.asset_db.with_suffix('.parts.sqlite3')),
        }
        server.libraries[PARTS].import_person_parts(server.libraries[ASSETS])
        server.transport = transport
        server.gpu_request = Lock()
        print(f'PoseWear local preview at http://127.0.0.1:{server.server_port}', flush=True)
        server.serve_forever()


if __name__ == '__main__':
    main()
