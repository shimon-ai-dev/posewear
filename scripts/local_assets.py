"""Store people, labels and original images in the local preview database."""

from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import time
from uuid import uuid4

MAX_IMAGE_BYTES = 32 * 1024 * 1024


def clean_name(value, limit):
    if not isinstance(value, str) or not 0 < len(value.strip()) <= limit:
        raise ValueError('名称不能为空或超过长度限制。')
    return value.strip()


def image_mime(data):
    if isinstance(data, bytes) and 0 < len(data) <= MAX_IMAGE_BYTES:
        if data.startswith(b'\x89PNG\r\n\x1a\n'):
            return 'image/png'
        if data.startswith(b'\xff\xd8\xff'):
            return 'image/jpeg'
        if data.startswith(b'RIFF') and data[8:12] == b'WEBP':
            return 'image/webp'
    raise ValueError('只支持不超过 32 MiB 的 PNG、JPEG 或 WebP 图片。')


class AssetLibrary:
    def __init__(self, path):
        self.path = Path(path).expanduser()
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        try:
            os.close(os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600))
        except FileExistsError:
            pass
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)')
            db.execute('''CREATE TABLE IF NOT EXISTS labels (
                id TEXT PRIMARY KEY, person TEXT NOT NULL REFERENCES people(id),
                name TEXT NOT NULL, UNIQUE(person, name)
            )''')
            db.execute('''CREATE TABLE IF NOT EXISTS parts (
                id TEXT PRIMARY KEY, person TEXT NOT NULL REFERENCES people(id),
                name TEXT NOT NULL, UNIQUE(person, name)
            )''')
            db.execute('''CREATE TABLE IF NOT EXISTS photos (
                id TEXT PRIMARY KEY, person TEXT NOT NULL REFERENCES people(id),
                source TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, created INTEGER NOT NULL,
                mime TEXT NOT NULL, content BLOB NOT NULL, part TEXT REFERENCES parts(id), UNIQUE(person, source)
            )''')
            db.execute('''CREATE TABLE IF NOT EXISTS photo_labels (
                photo TEXT NOT NULL REFERENCES photos(id), label TEXT NOT NULL REFERENCES labels(id),
                PRIMARY KEY(photo, label)
            )''')
            if 'part' not in {row['name'] for row in db.execute('PRAGMA table_info(photos)')}:
                db.execute('ALTER TABLE photos ADD COLUMN part TEXT REFERENCES parts(id)')
            self.migrate(db)

    def connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        return db

    def migrate(self, db):
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='images'").fetchone():
            return
        for row in db.execute('SELECT * FROM images ORDER BY created, rowid'):
            person = self.add_person(db, row['person'])
            source = 'generated:' + row['source']
            if db.execute('SELECT 1 FROM photos WHERE person=? AND source=?', (person, source)).fetchone():
                source += ':' + row['id']
            db.execute('INSERT INTO photos(id, person, source, name, kind, created, mime, content) VALUES (?,?,?,?,?,?,?,?)',
                       (row['id'], person, source, '生成图', 'generated', row['created'], row['mime'], row['content']))
            tag_ids = [self.add_label(db, person, tag) for tag in json.loads(row['tags'])]
            self.link_labels(db, row['id'], tag_ids)
        db.execute('DROP TABLE images')

    def import_person_parts(self, source):
        """Copy existing part references into the standalone category library."""
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('PRAGMA user_version').fetchone()[0] >= 1:
                return
            with closing(source.connect()) as legacy:
                legacy.execute('BEGIN')
                category_ids = {
                    row['id']: self.add_person(db, row['name'])
                    for row in legacy.execute('SELECT id, name FROM parts')
                }
                labels_by_photo = {}
                for row in legacy.execute("""SELECT pl.photo, labels.name FROM photo_labels pl
                    JOIN photos ON photos.id = pl.photo JOIN labels ON labels.id = pl.label
                    WHERE photos.kind = 'part'"""):
                    labels_by_photo.setdefault(row['photo'], []).append(row['name'])
                for photo in legacy.execute("SELECT * FROM photos WHERE kind = 'part' AND part IS NOT NULL"):
                    category = category_ids[photo['part']]
                    source_key = 'reference:' + hashlib.sha256(photo['content']).hexdigest()
                    if db.execute('SELECT 1 FROM photos WHERE person=? AND source=?', (category, source_key)).fetchone():
                        source_key += ':' + photo['id']
                    db.execute("""INSERT INTO photos
                        (id, person, source, name, kind, created, mime, content)
                        VALUES (?, ?, ?, ?, 'reference', ?, ?, ?)""",
                        (photo['id'], category, source_key, photo['name'],
                         photo['created'], photo['mime'], photo['content']))
                    labels = [self.add_label(db, category, name) for name in labels_by_photo.get(photo['id'], [])]
                    self.link_labels(db, photo['id'], labels)
            db.execute('PRAGMA user_version = 1')

    @staticmethod
    def add_person(db, name):
        db.execute('INSERT OR IGNORE INTO people VALUES (?,?)', (uuid4().hex, name))
        return db.execute('SELECT id FROM people WHERE name=?', (name,)).fetchone()['id']

    @staticmethod
    def add_label(db, person, name):
        db.execute('INSERT OR IGNORE INTO labels VALUES (?,?,?)', (uuid4().hex, person, name))
        return db.execute('SELECT id FROM labels WHERE person=? AND name=?', (person, name)).fetchone()['id']

    @staticmethod
    def link_labels(db, photo, labels):
        db.executemany('INSERT OR IGNORE INTO photo_labels VALUES (?,?)', [(photo, label) for label in labels])

    @staticmethod
    def validate_labels(db, person, labels):
        if not isinstance(labels, list) or len(labels) > 20 or any(not isinstance(label, str) for label in labels):
            raise ValueError('每张图最多选择 20 个标签。')
        known = {row['id'] for row in db.execute('SELECT id FROM labels WHERE person=?', (person,))}
        if set(labels) - known:
            raise ValueError('请选择该人物的标签。')
        return list(dict.fromkeys(labels))

    def list(self):
        with closing(self.connect()) as db, db:
            db.execute('BEGIN')
            people = {row['id']: dict(row, labels=[], photos=[]) for row in db.execute('SELECT * FROM people ORDER BY name')}
            for row in db.execute('SELECT * FROM labels ORDER BY name'):
                people[row['person']]['labels'].append({'id': row['id'], 'name': row['name']})
            photo_labels = {}
            for row in db.execute('SELECT * FROM photo_labels'):
                photo_labels.setdefault(row['photo'], []).append(row['label'])
            for row in db.execute("SELECT id, person, name, kind, created, mime FROM photos WHERE kind != 'part' ORDER BY created DESC, rowid DESC"):
                people[row['person']]['photos'].append(dict(row, labels=photo_labels.get(row['id'], [])))
            return list(people.values())

    def image(self, image_id):
        with closing(self.connect()) as db:
            return db.execute('SELECT mime, content FROM photos WHERE id=?', (image_id,)).fetchone()

    def create_person(self, name):
        with closing(self.connect()) as db, db:
            return self.add_person(db, clean_name(name, 80))

    def create_label(self, person, name):
        with closing(self.connect()) as db, db:
            if not db.execute('SELECT 1 FROM people WHERE id=?', (person,)).fetchone():
                raise ValueError('请先选择人物。')
            return self.add_label(db, person, clean_name(name, 40))

    def save(self, fields, data):
        person, kind = fields.get('person'), fields.get('kind')
        if kind not in ('generated', 'reference'):
            raise ValueError('图片类型无效。')
        name = clean_name(fields.get('name') or '生成图', 120)
        mime = image_mime(data)
        key = hashlib.sha256(data).hexdigest() if kind != 'generated' else clean_name(fields.get('source'), 100)
        source = kind + ':' + key
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            if not db.execute('SELECT 1 FROM people WHERE id=?', (person,)).fetchone():
                raise ValueError('请先选择人物。')
            labels = self.validate_labels(db, person, json.loads(fields.get('labels', '[]')))
            db.execute('''INSERT OR IGNORE INTO photos(id, person, source, name, kind, created, mime, content)
                       VALUES (?,?,?,?,?,?,?,?)''',
                       (uuid4().hex, person, source, name, kind, int(time.time()), mime, data))
            photo = db.execute('SELECT id FROM photos WHERE person=? AND source=?', (person, source)).fetchone()['id']
            self.link_labels(db, photo, labels)
            return photo

    def update_tags(self, image_id, labels):
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT person FROM photos WHERE id=?', (image_id,)).fetchone()
            if row is None:
                return False
            labels = self.validate_labels(db, row['person'], labels)
            db.execute('DELETE FROM photo_labels WHERE photo=?', (image_id,))
            self.link_labels(db, image_id, labels)
            return True
