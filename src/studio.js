'use strict';
(()=>{const A=window.APP;if(!A)return;const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s),esc=A.esc,toast=A.toast;
const LS=k=>{try{return JSON.parse(localStorage[k]||'null')}catch(e){return null}},SV=(k,v)=>{try{localStorage[k]=JSON.stringify(v)}catch(e){}};
// ---------- 服务商 ----------
const PROV={openai:{name:'OpenAI',base:'https://api.openai.com/v1',model:'gpt-image-1',models:['gpt-image-1','gpt-image-1-mini','gpt-image-2','dall-e-2']},
 gemini:{name:'Gemini',base:'https://generativelanguage.googleapis.com/v1beta',model:'gemini-2.5-flash-image',models:['gemini-2.5-flash-image','gemini-3-pro-image-preview','gemini-3.1-flash-image']},
 seedream:{name:'豆包 Seedream',base:'https://ark.cn-beijing.volces.com/api/v3',model:'doubao-seedream-5-5-261028',models:['doubao-seedream-5-5-261028','doubao-seedream-5-0-flash-260915','doubao-seedream-4-5-251128','doubao-seedream-4-0-250828']},
 qwen:{name:'本地 3090',model:'qwen-image-2.1',models:['qwen-image-2.1']},
 custom:{name:'自定义中转',base:'',model:'gpt-image-1',models:['gpt-image-1','gpt-image-2','grok-imagine-image-2.0','gemini-2.5-flash-image','flux-kontext-pro','qwen-image-edit','doubao-seedream-4-0-250828']}};
const storedCfg=LS('wbCfg');
const cfg=Object.assign({prov:'openai',base:'',key:'',model:'',field:'image[]',proto:'edits',proxy:false},storedCfg||{});
const QWEN_ENDPOINT='/api/local-qwen/';
let qwenAvailable=false;
const configured=()=>cfg.prov==='qwen'?qwenAvailable:!!cfg.key;
// ---------- 预设 ----------
const CHARS=[['asia','东亚女性','an adult East Asian woman in her mid-20s, long black hair, natural makeup, slim build','一位二十多岁的成年东亚女性，黑色长发，自然淡妆，身材纤细'],
 ['west','欧美女性','an adult Caucasian woman in her late 20s, wavy light-brown hair, natural makeup, athletic build','一位二十多岁的成年欧美女性，浅棕色波浪长发，自然妆容，匀称身材'],
 ['man','男性模特','an adult East Asian man in his late 20s, short black hair, clean-shaven, tall and lean','一位二十多岁的成年东亚男性，黑色短发，干净面容，高瘦身材'],
 ['anime','动漫角色','an adult anime-style girl, long silver hair, large expressive eyes, adult proportions, clean cel-shaded illustration','一位成年动漫风格女性角色，银色长发，大眼睛，成人身材比例，干净的赛璐璐上色插画'],
 ['custom','自定义','','']];
const STYLES=[['keep','照片质感','photorealistic, matching the original photo quality','写实摄影质感，与原照片画质一致'],['studio','影棚大片','clean high-end fashion studio, soft key light, seamless light-grey backdrop, editorial lookbook photo','高端时尚影棚，柔和主光，浅灰无缝背景，杂志画册质感'],
 ['street','城市街拍','candid city street-style photo, natural daylight, shallow depth of field','城市街拍抓拍，自然日光，浅景深'],['ecom','电商白底','e-commerce product-model photo, pure white background, even lighting, full body','电商模特图，纯白背景，均匀布光，全身构图'],
 ['film','胶片氛围','35mm film photograph, warm tones, subtle grain, golden hour light','35mm 胶片摄影，暖色调，轻微颗粒，黄金时刻光线'],['anime','动漫插画','high-quality anime illustration, clean line art, soft cel shading','高质量动漫插画，干净线稿，柔和赛璐璐上色']];
const ANG_EN={'正面':'front view','斜侧':'three-quarter view','侧面':'side profile','俯拍':'high-angle shot looking down','仰拍':'low-angle shot looking up','背面':'back view','下から':'low angle'};
const W={workspace:LS('wbWorkspace')==='face'?'face':'tryon',mode:LS('wbMode')||'tryon',
 face:Object.assign({scope:'face',clothes:false,scene:true,pose:true,expression:true},LS('wbFace')||{}),
 faceBases:[],persons:[],parts:[],garments:[],poses:[],exprs:[],char:LS('wbChar')||'asia',charTxt:LS('wbCharTxt')||'',style:LS('wbStyle')||'keep',bm:LS('wbBm')||'each',pl:LS('wbPl')||'en',keepBg:LS('wbKeepBg')??true,busy:null,dirty:false,results:[],ri:0,cmp:true};
// item: {kind:'lib',k,ai?} | {kind:'file',blob,url,name}
const g0=LS('wbSel')||{};
// ---------- 工具 ----------
const normBase=b=>(b||'').trim().replace(/\/+$/,'');
function root(){let b=normBase(cfg.base)||PROV[cfg.prov].base;if(cfg.prov=='gemini')return/\/v1(beta|alpha)?$/.test(b)?b:b+'/v1beta';if(cfg.prov=='seedream')return b;return/\/v\d+$/.test(b)?b:b+'/v1'}
const modelOf=()=>(cfg.model||'').trim()||PROV[cfg.prov].model;
const proto=()=>cfg.prov=='openai'?'edits':cfg.prov=='custom'?cfg.proto:cfg.prov;
function loadImg(src){return new Promise((r,j)=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>j(Error('图片读取失败'));i.src=src})}
async function toJpeg(src,max=1536){const i=await loadImg(src);let w=i.naturalWidth,h=i.naturalHeight,s=Math.min(1,max/Math.max(w,h));w=Math.round(w*s);h=Math.round(h*s);
 const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(i,0,0,w,h);return new Promise(r=>c.toBlob(b=>r({blob:b,w,h}),'image/jpeg',.92))}
const libSrc=a=>{const it=A.ITEMS[a.k];return it.angles?it.angles[a.ai??it.ai].i:it.i};
async function assetBlob(a){if(a.kind=='file')return a.blob;const src=libSrc(a), ref=A.ITEMS[a.k]?.ref;const r=await fetch(src,ref?{referrerPolicy:ref}:undefined);if(!r.ok)throw Error('素材下载失败（'+r.status+'）');const u=URL.createObjectURL(await r.blob());try{return(await toJpeg(u,1280)).blob}finally{URL.revokeObjectURL(u)}}
const b64=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(b)});
const dataURL=async b=>'data:'+(b.type||'image/jpeg')+';base64,'+await b64(b);
const isFace=()=>W.workspace==='face';
const isGen=()=>!isFace()&&W.mode==='gen';
const hasPerson=()=>W.persons.length>0;
const usedGarments=()=>isFace()&&!W.face.clothes?[]:W.garments;
const usedPoses=()=>isFace()&&W.face.pose?[]:W.poses;
const usedExpressions=()=>isFace()&&W.face.expression?[]:W.exprs;
const MAX_REFERENCES=4;
function referenceSlots(kind='person'){
 if(kind==='face')return Math.max(0,6-W.faceBases.length);
 const count=kind==='part'?W.parts.length:W.persons.length;
 const total=cfg.prov==='qwen'?W.persons.length+W.parts.length+(isFace()?1:0):count;
 return Math.max(0,MAX_REFERENCES-total);
}
// ---------- 提示词 ----------
function poseDesc(p,en){const it=A.ITEMS[p.k];if(!it)return'';const a=it.angles[p.ai??it.ai];return en?`${it.en} (${it.lineEn}, ${ANG_EN[a.zh]||a.en||a.zh})${/2人|双人/.test(it.line)?' — a two-person pose: match the number of people and their relative positions':''}`:`${it.zh}（${it.line}，${a.zh}）${/2人|双人/.test(it.line)?'——双人姿势，人数与相对位置需与线稿一致':''}`}
function composeFace(poses){
 const en=W.pl==='en';
 let offset=1;
 const range=count=>{
  if(!count)return '';
  const first=offset+1;offset+=count;
  const numbers=count===1?String(first):`${first}–${offset}`;
  return en?(count===1?'image ':'images ')+numbers:`第 ${numbers} 张图`;
 };
 const identities=range(W.persons.length), garments=range(usedGarments().length);
 const posing=range(poses.length), expressions=range(usedExpressions().length);
 const parts=W.parts.map(part=>`${range(1)} (${part.name})`);
 const extra=$('#wbExtra').value.trim();
 const look=STYLES.find(style=>style[0]===W.style)||STYLES[0];
 const face=W.face;
 if(en)return[
  'Edit image 1, the original photo. Replace the face of its primary person with the identity from '+(identities||'the selected target references')+'. Those images show the same target person and are identity references only. Edit only the primary person; leave other people unchanged.',
  face.scope==='body'
   ?'Transfer both the target face and visible body proportions. Reconcile the new proportions with the requested pose and clothing.'
   :'Change the face only except for the explicitly requested changes below. Keep the original body proportions and hairstyle.',
  face.clothes
   ?(garments?`Replace clothing using ${garments}; match their fabric, cut and color.`:'Change clothing according to the clothing description if provided, otherwise use the outfit visible on the target person.')
   :'Keep the clothing and accessories in image 1.',
  face.scene?'Keep the setting, background, lighting, framing, and camera viewpoint of image 1.':`The setting and lighting may change. Use this look: ${look[2]}.`,
  face.pose?'Match the posture and body orientation in image 1.':posing?`Use ${posing} for the new posture: ${poses.map(p=>poseDesc(p,true)).join(', ')}.`:'The pose may change to match the requested composition.',
  face.expression?'Keep the expression and gaze of image 1.':expressions?`Use ${expressions} only for the new expression; keep the target identity.`:'The expression may change to fit the requested mood.',
  parts.length?'Use these images only as local references for the indicated body parts: '+parts.join(', ')+'.':'',
  'Keep natural facial alignment, lighting, and realistic edges.',
  extra?'Additional direction: '+extra:''
 ].filter(Boolean).join('\n');
 return[
  '以第 1 张换前原图为底图。把原图主角的脸换成'+(identities||'所选换后人物参考')+'的身份。这些参考图是同一位目标人物，只用来确定身份。保留原图中其他人物。',
  face.scope==='body'?'同步更换面部和可见的身体轮廓与身材比例，按所选姿势和服装自然贴合。':'除下方明确选中的改动外，只更换脸部，保留原图的身材比例和发型。 ',
  face.clothes?(garments?`按${garments}更换服装，匹配面料、版型和颜色。`:'按补充要求描述更换服装，未描述时参考目标人物衣着。'):'保留原图服装和配饰。',
  face.scene?'保留原图场景、背景、光线、构图和机位。':`可调整场景和光线，采用${look[3]}。`,
  face.pose?'保持原图姿势、肢体动作和朝向。':posing?`以${posing}作为新姿势参考，${poses.map(p=>poseDesc(p,false)).join('、')}。`:'可以按构图需要调整姿势。',
  face.expression?'保留原图的表情和视线。':expressions?`按${expressions}更换表情，保留目标人物身份。`:'可以按画面氛围调整表情。',
  parts.length?'部位参考仅用于对应局部，'+parts.join('、')+'。':'',
  '保证面部对齐、自然光影和边缘融合。',
  extra?'补充：'+extra:''
 ].filter(Boolean).join('\n');
}
function compose(poseSet){
 if(isFace())return composeFace(poseSet||usedPoses());
 const en=W.pl=='en',P=W.persons.length,G=W.garments.length,ps=poseSet||W.poses,np=ps.length,sheet=np>1;const style=STYLES.find(s=>s[0]==W.style)||STYLES[0],ch=CHARS.find(c=>c[0]==W.char)||CHARS[0],ex=$('#wbExtra').value.trim();
 const gi=W.garments.map(g=>g.kind=='lib'&&A.ITEMS[g.k]).filter(Boolean);let n=0;const rng=(c)=>{if(!c)return null;const a=n+1,b=n+c;n=b;return a==b?(en?`image ${a}`:`第 ${a} 张`):(en?`images ${a}–${b}`:`第 ${a}–${b} 张`)};
 const E=W.exprs.length,ei=E?A.ITEMS[W.exprs[0].k]:null;const rP=rng(P),rG=rng(G),rS=rng(np),rE=rng(E);
 const regions=W.parts.map(part=>`${rng(1)} (${part.name})`);
 const L=[];
 if(en){L.push(P?`Fashion ${G&&!isGen()?'virtual try-on':'image generation'} using reference images. ${rP} ${P>1?'show':'shows'} the person (same individual)${G?`; ${rG} ${G>1?'show':'shows'} the outfit${G>1?' pieces (top and bottom)':''} on an invisible mannequin`:''}${np?`; ${rS} ${np>1?'are':'is'} pose reference${np>1?'s':''}`:''}.`:`Fashion image generation.${G||np?' Use the supplied references. ':''}${G?`${rG} ${G>1?'show':'shows'} the outfit on an invisible mannequin`:''}${np?`; ${rS} ${np>1?'are':'is'} pose reference${np>1?'s':''}`:''}.`);
  L.push(P?"Subject: the person from the photo. Preserve their face, identity, hairstyle, skin tone and body proportions exactly; they must stay recognisably the same adult.":`Subject: ${(W.char=='custom'?W.charTxt:ch[2])||ch[2]||'an adult model'}. Always an adult with adult proportions.`);
  if(G)L.push(`Outfit: dress the subject in the complete outfit from ${rG}, reproducing every garment faithfully — cut, color, fabric, pattern, layering, shoes and accessories${gi.length?': '+gi.map(x=>x.en.replace(/^[^,]*outfit,\s*/,'')).join('; '):''}. Replace the original clothing entirely. Never draw the mannequin or a blank body.`);
  if(np)L.push((sheet&&W.bm=='sheet'?`Pose: draw ${np} panels in one image, one per pose reference, same subject and outfit in every panel, with even spacing and no text: `:'Pose: ')+ps.map((p,i)=>(sheet&&W.bm=='sheet'?`(${i+1}) `:'')+poseDesc(p,true)).join('; ')+'. Use the pose references (line sketches or depth maps) only for body posture, weight, limb placement and camera angle; never draw sketch lines, joint circles or guide marks.');
  else if(P)L.push('Pose: keep the original pose, framing and camera angle.');
  if(E&&ei)L.push(`Expression: ${rE} is a faceless neutral head model showing the target expression (${ei.en}). Give the subject exactly this facial expression. Transfer ONLY the expression — the subject's own facial features, face shape and identity must remain exactly as in the person photo; never copy the reference head's face.`);
  if(regions.length)L.push('Body-part references: '+regions.join(', ')+'. Use only the named region in each image as a local visual reference. Keep the subject and other regions consistent with the full-person references or description.');
  L.push(`Look: ${P&&W.keepBg&&!isGen()?'keep the original background and lighting of the photo; ':''}${style[2]}. Natural fabric drape with realistic folds and shadows, high detail. No text, no watermark, no borders.`);
  if(ex)L.push('Additional: '+ex)}
 else{L.push(P?`时尚${G&&!isGen()?'虚拟试穿':'生图'}，使用参考图。${rP}是人物照片（同一人）${G?`；${rG}是放在隐形人台上的服装${G>1?'（上装与下装）':''}`:''}${np?`；${rS}是姿势参考图`:''}。`:`时尚人物图。${G||np?'根据所附参考图创作。':''}${G?`${rG}是放在隐形人台上的服装`:''}${np?`；${rS}是姿势参考图`:''}。`);
  L.push(P?'人物：照片中的人。严格保留其面部、身份特征、发型、肤色与身材比例，必须一眼认出是同一位成年人。':`人物：${(W.char=='custom'?W.charTxt:ch[3])||ch[3]||'一位成年模特'}。始终为成年人比例。`);
  if(G)L.push(`服装：为人物换上${rG}中的整套服装，准确还原版型、颜色、面料、图案、叠穿、鞋袜与配饰${gi.length?'：'+gi.map(x=>x.zh.replace(/[。.]$/,'')).join('；'):''}。完全替换原有衣物，不要画出人台或空白身体。`);
  if(np)L.push((sheet&&W.bm=='sheet'?`姿势：在同一张图中画 ${np} 格，每格对应一张姿势参考图，人物与服装保持一致，均匀留白，不写文字：`:'姿势：')+ps.map((p,i)=>(sheet&&W.bm=='sheet'?`（${i+1}）`:'')+poseDesc(p,false)).join('；')+'。线稿或深度图只用于提取身体姿态、重心、四肢位置和镜头角度，不要画出线条、关节圆或辅助线。');
  else if(P)L.push('姿势：保持原照片的姿势、构图和拍摄角度。');
  if(E&&ei)L.push(`表情：${rE} 是一张无身份头模的表情参考（${ei.zh}）。让人物做出完全一致的表情。只迁移神态——人物本人的五官、脸型和身份必须与照片完全一致，不要照搬参考头的脸。`);
  if(regions.length)L.push('部位参考：'+regions.join('、')+'。每张图只参考括号中指定部位的局部特征，其余部位按人物参考或模特描述生成。');
  L.push(`画面：${P&&W.keepBg&&!isGen()?'保留原照片的背景与光线；':''}${style[3]}。衣物垂坠自然，褶皱阴影真实，高细节。不要文字、水印或边框。`);
  if(ex)L.push('补充：'+ex)}
 return L.join('\n')}
function reprompt(force){if(force||!W.dirty){$('#wbPrompt').value=compose();W.dirty=false}}
// ---------- 渲染 ----------
function pickRow(a,type,i){const it=a.kind=='lib'&&A.ITEMS[a.k];if(a.kind=='lib'&&!it)return'<div class="empty0">加载中…</div>';
 const src=it?(type=='pose'?A.ath(it.angles[a.ai??it.ai].t):A.thumb(it)):a.url,t=it?A.title(it):(a.name||'自定义图片'),sub=it?(it.type=='pose'?it.line+' · '+it.angles[a.ai??it.ai].zh:it.cat+' · '+it.id):(type=='costume'?(W.garments.length>1?(i==0?'上装':'下装'):'本地上传'):'本地上传');
 return`<div class="pick ${type}"><img src="${src}" alt="${esc(t)}"><div><b>${esc(t)}</b><small>${esc(sub)}</small></div>${(type=='pose'||type=='expr')&&it?`<select data-ang="${i}" aria-label="角度">${it.angles.map((x,j)=>`<option value="${j}" ${j==(a.ai??it.ai)?'selected':''}>${x.zh}</option>`).join('')}</select>`:''}<button class="rmx" data-rm="${type}" data-i="${i}" aria-label="移除" title="移除">×</button></div>`}
function render(){
 const G=isGen(), face=isFace();
 for(const button of $$('[data-workspace], [data-face-scope]')){
  const active=(button.dataset.workspace||button.dataset.faceScope)===(button.dataset.workspace?W.workspace:W.face.scope);
  button.classList.toggle('on',active);
  button.setAttribute('aria-pressed',active);
  button.disabled=!!W.busy;
 }
 $('#tryonModes').hidden=$('#wbTryonFlow').hidden=face;
 $('#wbStyleField').hidden=face&&W.face.scene;
 $('#wbPhInput').textContent=face?'原图':'人物';
 $('#wbPhRef').textContent=face?'换后人物':'服装';
 $('#wbPhHint').textContent=face?'选好换前原图和换后人物，即可生成。':'选好人物参考或设定模特后，即可生成';
 $('#wbFaceBaseStep').hidden=$('#wbFaceOptions').hidden=!face;
 $('.step[data-s="2"]').hidden=face&&!W.face.clothes;
 $('.step[data-s="3"]').hidden=face&&W.face.pose;
 $('#wbEx').closest('.step').hidden=face&&W.face.expression;
 $('#wbFaceClothes').checked=W.face.clothes;
 $('#wbFaceScene').checked=W.face.scene;
 $('#wbFacePose').checked=W.face.pose;
 $('#wbFaceExpression').checked=W.face.expression;
 $('#wbFaceDrop').hidden=!referenceSlots('face');
 $('#wbFaceBases').innerHTML=W.faceBases.map((source,i)=>`<div class="pp"><img src="${source.url}" alt="${esc(source.name)}"><small title="${esc(source.name)}">${i+1}. ${esc(source.name)}</small><button class="x" data-rmface="${i}" aria-label="移除原图 ${i+1}">×</button></div>`).join('');
 $('#wbUse').textContent=face?'设为换前原图':'当原图';
 $$('[data-mode]').forEach(b=>b.classList.toggle('on',b.dataset.mode==W.mode));
 $('#stLead').textContent=face?'先选换后人物，再选换前原图。选多张原图时会逐张生成。':G?'按模特设定生成，服装、姿势和部位参考可选。':'上传或选择人物参考图，按需添加服装和部位参考。';
 $('#s1T').textContent=face?'换后人物':G?'模特':'人物';$('#s1R').textContent=G?'可传脸部参考':'必选';
 $('#wbPersons').innerHTML=W.persons.map((p,i)=>`<div class="pp"><img src="${p.url}" alt="人物照片 ${i+1}"><small title="${p.w}×${p.h}">${esc(p.source||(p.k?'图库人像':'工作台生成'))}</small><button class="x" data-rmp="${i}" aria-label="移除">×</button></div>`).join('');
 $('#wbParts').innerHTML=W.parts.map((p,i)=>`<div class="pp"><img src="${p.url}" alt="${esc(p.name)}"><small>${esc(p.name)}</small><button class="x" data-rmpart="${i}" aria-label="移除 ${esc(p.name)}">×</button></div>`).join('');
 $('#wbDrop').classList.toggle('mini',W.persons.length>0);$('#wbDrop').hidden=!referenceSlots();$('#wbChar').hidden=!G||hasPerson();
 $('#wbChars').innerHTML=CHARS.map(c=>`<button class="chip ${W.char==c[0]?'on':''}" data-char="${c[0]}">${c[1]}</button>`).join('');$('#wbCharTxt').hidden=W.char!='custom';$('#wbCharTxt').value=W.charTxt;
 $('#wbG').innerHTML=W.garments.length?W.garments.map((g,i)=>pickRow(g,'costume',i)).join(''):'<button class="empty0" data-pick="costume"><span><b>选择服装（可选）</b><small>从库里选，或上传图片</small></span></button>';
 $('#wbPo').innerHTML=W.poses.length?W.poses.map((p,i)=>pickRow(p,'pose',i)).join(''):`<button class="empty0" data-pick="pose"><span><b>选择姿势（可选）</b><small>${G?'不选就随机':'不选就保持原姿势'}</small></span></button>`;
 $('#wbEx').innerHTML=W.exprs.length?W.exprs.map((g,i)=>pickRow(g,'expr',i)).join(''):'<button class="empty0" data-pick="expr"><span><b>选择表情（可选）</b><small>只取神态，不换脸</small></span></button>';
 $('#wbBatch').hidden=W.poses.length<2;$$('[data-bm]').forEach(b=>b.classList.toggle('on',b.dataset.bm==W.bm));$('#wbAllAng').hidden=W.poses.length!=1||!A.ITEMS[(W.poses[0]||{}).k];
 $('#wbStyles').innerHTML=STYLES.map(s=>`<button class="chip ${W.style==s[0]?'on':''}" data-style="${s[0]}">${s[1]}</button>`).join('');$('#wbKeepBg').checked=W.keepBg;$('#wbKeepBg').closest('label').hidden=face||G||!hasPerson();
 $$('[data-pl]').forEach(b=>b.classList.toggle('on',b.dataset.pl==W.pl));
 updateQwenSizes();
 const ok=configured();$('#wbDot').className='dot'+(ok?' on':'');$('#wbProv').textContent=ok?PROV[cfg.prov].name+' · '+modelOf():'未配置 API';$('#wbDot2').className='dot'+(ok?' on':'');$('#wbProv2').textContent=ok?PROV[cfg.prov].name:'未配置 API';$('#wbOnb').hidden=ok;
 const dn=[G?true:hasPerson(),W.garments.length>0,W.poses.length>0,!!(W.style||$('#wbExtra').value)];$$('.step[data-s]').forEach(e=>e.classList.toggle('done',dn[e.dataset.s-1]));
 const jobs=nJobs();$('#wbGo').textContent='生成';$('#wbEst').textContent=`将生成 ${jobs} 张`;
 const miss=[inputMissing(),!ok&&(cfg.prov==='qwen'?'本地 3090 预览服务':'API 密钥')].filter(Boolean);$('#wbHint').textContent=miss.length?'还缺：'+miss.join('、'):'每张约半分钟';$('#wbHint').classList.toggle('miss',!!miss.length);const need=[inputMissing()].filter(Boolean);if(!W.busy){$('#wbGo').disabled=!!need.length;$('#wbGo').title=need.length?'请先'+need.join('、'):'';if(need.length)$('#wbGo').textContent='请先'+need[0]}$$('.flow [data-f]').forEach(e=>e.classList.toggle('on',e.dataset.f<4?dn[e.dataset.f-1]&&(e.dataset.f!=3||W.poses.length>0):!need.length));
 SV('wbSel',{g:W.garments.filter(g=>g.kind=='lib').map(g=>g.k),p:W.poses.filter(p=>p.kind=='lib').map(p=>[p.k,p.ai]),e:W.exprs.filter(g=>g.kind=='lib').map(g=>[g.k,g.ai])});reprompt()}
function inputMissing(){
 if(isFace()&&!hasPerson())return '换后人物';
 if(isFace()&&!W.faceBases.length)return '换前原图';
 if(!isGen()&&!hasPerson())return '人物照片';
 return '';
}
function jobsForWorkspace(){
 const poses=usedPoses();
 const sets=poses.length>1&&W.bm==='each'?poses.map(p=>[p]):[poses];
 const bases=isFace()?W.faceBases:[null];
 const count=+$('#wbN').value||1;
 return bases.flatMap(base=>sets.flatMap(set=>Array.from({length:count},()=>({base,set}))));
}
const nJobs=()=>jobsForWorkspace().length;
// ---------- 上传 ----------
async function addPortrait(it){if(!referenceSlots())return toast('人物参考图数量已满');try{const x=await toJpeg(it.m,1536);W.persons.push({blob:x.blob,url:URL.createObjectURL(x.blob),w:x.w,h:x.h,k:it.k});render();toast(W.mode=='gen'?'已设为脸部参考（生成时保持这张脸）':'已设为人物照片')}catch(e){toast('人像加载失败')}}
async function addReferences(files,kind){
 const items=kind==='face'?W.faceBases:kind==='part'?W.parts:W.persons;
 let count=0;
 for(const {blob,name,part,source} of files){
  if(!referenceSlots(kind)){toast('参考图数量已满');break}
  if(!/^image\//.test(blob.type)){toast('请选择图片文件');continue}
  const url=URL.createObjectURL(blob);
  try{
   const image=await toJpeg(url,kind==='part'?1280:1536);
   items.push({...image,url:URL.createObjectURL(image.blob),name:part||name||'原图',source});
   count++;
  }catch(error){toast('无法读取这张图片')}
  finally{URL.revokeObjectURL(url)}
 }
 render();
 return count;
}
const addAssetPersons=refs=>addReferences(refs,'person');
const addPersons=files=>addAssetPersons([...files].map(blob=>({blob,source:'本地上传'})));
const addParts=refs=>addReferences(refs,'part');
const addFaceBases=refs=>addReferences(refs,'face');
$('#wbFaceFile').onchange=event=>{
 addFaceBases([...event.target.files].map(blob=>({blob,name:blob.name})));
 event.target.value='';
};
const drop=$('#wbDrop');$('#wbFile').onchange=e=>{addPersons(e.target.files);e.target.value=''};
['dragenter','dragover'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('over')}));['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('over')}));
drop.addEventListener('drop',e=>addPersons(e.dataTransfer.files));drop.addEventListener('keydown',e=>{if(e.key=='Enter'||e.key==' '){e.preventDefault();$('#wbFile').click()}});
$('#wbGFile').onchange=async e=>{const fs=[...e.target.files];e.target.value='';W.garments=W.garments.filter(g=>g.kind=='file');for(const f of fs){if(W.garments.length>=2){toast('最多上传 2 张服装图（上装 + 下装）');break}const u=URL.createObjectURL(f);try{const r=await toJpeg(u,1280);URL.revokeObjectURL(u);W.garments.push({kind:'file',blob:r.blob,url:URL.createObjectURL(r.blob),name:f.name})}catch(x){toast('无法读取服装图')}}render()};
document.addEventListener('paste',e=>{if(A.workbenchOpen()&&!/INPUT|TEXTAREA/.test(document.activeElement.tagName)){const f=[...e.clipboardData.files].filter(f=>/^image/.test(f.type));if(f.length)addPersons(f)}});
function useWorkspace(workspace){
 if(W.busy||workspace===W.workspace)return;
 W.workspace=workspace==='face'?'face':'tryon';
 SV('wbWorkspace',W.workspace);
 W.dirty=false;
 render();
}
for(const [id,key] of [['wbFaceClothes','clothes'],['wbFaceScene','scene'],['wbFacePose','pose'],['wbFaceExpression','expression']]){
 $('#'+id).onchange=event=>{
  if(!W.busy)W.face[key]=event.target.checked;
  SV('wbFace',W.face);W.dirty=false;render();
 };
}
$('#studio').addEventListener('click',e=>{const t=e.target;let b;
 if(b=t.closest('[data-workspace]')){useWorkspace(b.dataset.workspace);return}
 if(b=t.closest('[data-face-scope]')){
  if(!W.busy){W.face.scope=b.dataset.faceScope;SV('wbFace',W.face);W.dirty=false;render()}
  return;
 }
 if(b=t.closest('[data-rmface]')){const [ref]=W.faceBases.splice(+b.dataset.rmface,1);if(ref)URL.revokeObjectURL(ref.url);render()}
 if(b=t.closest('[data-rm]')){const i=+b.dataset.i;b.dataset.rm=='pose'?W.poses.splice(i,1):b.dataset.rm=='expr'?W.exprs.splice(i,1):W.garments.splice(i,1);render()}
 if(b=t.closest('[data-rmp]')){const [ref]=W.persons.splice(+b.dataset.rmp,1);if(ref)URL.revokeObjectURL(ref.url);render()}
 if(b=t.closest('[data-rmpart]')){const [ref]=W.parts.splice(+b.dataset.rmpart,1);if(ref)URL.revokeObjectURL(ref.url);render()}
 if(b=t.closest('[data-pick]'))picker(b.dataset.pick);
 if(b=t.closest('[data-pl]')){W.pl=b.dataset.pl;SV('wbPl',W.pl);reprompt(true);render()}
 if(b=t.closest('[data-mode]')){W.mode=b.dataset.mode;SV('wbMode',W.mode);if(W.mode=='gen'&&W.style=='keep'){W.style='studio'}if(W.mode=='tryon'&&W.style=='studio'&&!W.dirtyStyle)W.style='keep';W.dirty=false;render()}
 if(b=t.closest('[data-char]')){W.char=b.dataset.char;SV('wbChar',W.char);render()}
 if(b=t.closest('[data-style]')){W.style=b.dataset.style;W.dirtyStyle=1;SV('wbStyle',W.style);render()}
 if(b=t.closest('[data-bm]')){W.bm=b.dataset.bm;SV('wbBm',W.bm);render()}});
$('#studio').addEventListener('change',e=>{const s=e.target.closest('[data-ang]');if(s){const row=s.closest('.pick');if(row&&row.classList.contains('expr'))W.exprs[+s.dataset.ang].ai=+s.value;else W.poses[+s.dataset.ang].ai=+s.value;render()}if(e.target.id=='wbN')render();if(e.target.id=='wbKeepBg'){W.keepBg=e.target.checked;SV('wbKeepBg',W.keepBg);render()}});
$('#wbCharTxt').oninput=e=>{W.charTxt=e.target.value;SV('wbCharTxt',W.charTxt);reprompt()};
$('#wbAllAng').onclick=()=>{const p=W.poses[0],it=A.ITEMS[p.k];W.poses=it.angles.slice(0,6).map((a,i)=>({kind:'lib',k:p.k,ai:i}));toast(`已展开 ${W.poses.length} 个角度`);render()};
$('#wbPrompt').oninput=()=>W.dirty=true;$('#wbExtra').oninput=()=>reprompt();$('#wbReP').onclick=()=>{reprompt(true);toast('已按当前选择重新生成提示词')};
$('#wbCopyP').onclick=()=>A.copy($('#wbPrompt').value,'提示词');
// ---------- 选择器 ----------
const pkSources={
 pose:[['pose','普通姿势'],['depth','深度姿势']],
 depth:[['pose','普通姿势'],['depth','深度姿势']],
 costume:[['costume','写实服装'],['anime','动画服装']],
 anime:[['costume','写实服装'],['anime','动画服装']]
};
const pkTitles={costume:'选择服装',anime:'选择服装',portrait:'选择公共图库人像',expr:'选择表情'};
let pkType='costume',pkPage=0,pkLoad=0,pkTimer;
const pkPose=()=>pkType==='pose'||pkType==='depth';
function pkTitle(){
 $('#pkT').textContent=pkPose()?`选择姿势（${W.poses.length}/6）`:pkTitles[pkType];
 $('#pkDone').hidden=!pkPose();
}
function pkCatalog(){return (A.DATA[pkType]||[]).filter(A.ok)}
function pkFilters(){
 const catalog=pkCatalog();
 $('#pkFacets').innerHTML=(A.catalogFilters[pkType]||[]).map(([key,label])=>{
  const values=new Set(catalog.flatMap(item=>A.catalogValue(item,key)));
  if(!values.size)return '';
  const options=[...values].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  return `<label>${label}<select data-filter="${key}"><option value="">全部</option>${options.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('')}</select></label>`;
 }).join('');
}
function pkPagination(page){
 $('#pkCount').textContent=page.total?`共 ${page.total} 项 · ${page.current+1} / ${page.pages} 页`:'共 0 项';
 $('#pkPrev').disabled=page.current===0;
 $('#pkNext').disabled=page.current+1>=page.pages;
}
function drawPk(scroll=true){
 if(!A.DATA[pkType])return;
 const words=A.searchTerms($('#pkQ').value);
 const filters=[...$$('#pkFacets select')].filter(el=>el.value);
 const matches=pkCatalog().filter(item=>filters.every(el=>A.catalogValue(item,el.dataset.filter).includes(el.value))&&A.matchesSearch(item,words));
 const page=A.paginate(matches,pkPage);
 pkPage=page.current;
 pkPagination(page);
 const selected=new Set(W.poses.map(p=>p.k));
 const angle=$('#pkFacets select[data-filter=ang]')?.value;
 $('#pkG').innerHTML=page.items.length?page.items.map(item=>{
  const title=esc(A.title(item)), active=selected.has(item.k);
  const image=item.angles?.find(a=>a.zh===angle)?.t||A.thumb(item);
  const ref=item.ref?` referrerpolicy="${esc(item.ref)}"`:'';
  return `<button data-k="${esc(item.k)}" class="${pkType} ${active?'on':''}" title="${title}"${pkPose()?` aria-pressed="${active}"`:''}><img loading="lazy" src="${esc(A.ath(image))}" alt=""${ref}><span>${title}</span></button>`;
 }).join(''):'<p class="fine">没有匹配的结果</p>';
 if(scroll)$('#pkG').scrollTop=0;
}
async function loadPk(type){
 const version=++pkLoad;
 pkType=type;
 pkPage=0;
 pkTitle();
 $('#pkFacets').replaceChildren();
 $('#pkG').innerHTML='<div class="skel"></div>'.repeat(12);
 $('#pkCount').textContent='正在加载…';
 $('#pkPrev').disabled=$('#pkNext').disabled=true;
 try{
  await A.load(type);
  if(version!==pkLoad)return;
  pkFilters();
  drawPk();
 }catch(error){
  if(version!==pkLoad)return;
  $('#pkG').innerHTML='<p class="fine">素材加载失败，请重新打开选择面板。</p>';
  $('#pkCount').textContent='';
 }
}
function picker(type){
 const sources=pkSources[type]||[];
 const source=$('#pkSource');
 source.replaceChildren(...sources.map(([id,label])=>new Option(label,id)));
 source.value=type;
 $('#pkSourceField').hidden=!sources.length;
 $('#pk').hidden=false;
 document.body.style.overflow='hidden';
 $('#pkQ').value='';
 loadPk(type);
 $('#pkQ').focus({preventScroll:true});
}
function resetPk(){pkPage=0;drawPk()}
$('#pkQ').oninput=()=>{clearTimeout(pkTimer);pkTimer=setTimeout(resetPk,150)};
$('#pkSource').onchange=event=>loadPk(event.target.value);
$('#pkFacets').onchange=resetPk;
$('#pkPrev').onclick=()=>{pkPage--;drawPk()};
$('#pkNext').onclick=()=>{pkPage++;drawPk()};
const pkClose=()=>{pkLoad++;clearTimeout(pkTimer);$('#pk').hidden=true;document.body.style.overflow='';render()};
$('#pkX').onclick=$('#pkDone').onclick=pkClose;
$('#pk').onclick=event=>{
 if(event.target.id==='pk')return pkClose();
 const button=event.target.closest('[data-k]');
 if(!button)return;
 const k=button.dataset.k,it=A.ITEMS[k];
 if(pkPose()){
  const index=W.poses.findIndex(p=>p.k===k);
  if(index>=0)W.poses.splice(index,1);
  else{
   if(W.poses.length>=6)return toast('最多选择 6 个姿势');
   const angle=$('#pkFacets select[data-filter=ang]')?.value;
   const match=it.angles.findIndex(a=>a.zh===angle);
   W.poses.push({kind:'lib',k,ai:match>=0?match:it.ai});
  }
  button.classList.toggle('on',index<0);
  button.setAttribute('aria-pressed',index<0);
  pkTitle();
 }else if(pkType==='portrait'){pkClose();addPortrait(it)}
 else if(pkType==='expr'){W.exprs=[{kind:'lib',k,ai:it.ai}];pkClose()}
 else{W.garments=[{kind:'lib',k}];pkClose()}
};
// ---------- 设置 ----------

// ---------- 减少误拦截：只改发送给服务商的措辞，不改服装、姿势 ----------
// [匹配, 替换]，按顺序执行；替换为空表示删掉
const NEUTRAL=[
 [/(?:胸部|臀部|腰臀|身材)(?:曲线|线条)?(?:突出|丰满|饱满|凸显)/g,''],[/凸显(?:身材|曲线|胸部|臀部)/g,''],[/火辣|撩人|诱惑|魅惑|勾人|性感/g,'时尚'],
 [/紧身/g,'修身'],[/露肩/g,'一字肩'],[/露背/g,'开背设计'],[/露脐/g,'短款'],[/低胸/g,'V 领'],[/透视/g,'薄纱拼接'],
 [/比基尼|泳装|泳衣/g,'泳池边时装'],[/情趣内衣|内衣/g,'内搭'],[/裸露|裸体|半裸/g,''],
 [/\b(?:emphasi[sz]ing|accentuating|showing off|highlighting) (?:her |his |the )?(?:curves|figure|body|bust|chest|hips|cleavage)\b/gi,''],
 [/\b(?:curvy|voluptuous|busty)\b/gi,''],[/\b(?:sexy|seductive|sultry|alluring|provocative|hot)\b/gi,'stylish'],
 [/\b(?:skin-?tight|bodycon)\b/gi,'fitted'],[/\btight\b/gi,'fitted'],[/\boff[- ]the[- ]shoulder\b/gi,'off-shoulder neckline'],[/\bbackless\b/gi,'open-back design'],
 [/\b(?:bikini|swimsuit|swimwear)\b/gi,'swimwear fashion catalog piece'],[/\b(?:lingerie|underwear|bra and panties)\b/gi,'loungewear catalog set'],
 [/\b(?:nude|naked|topless|cleavage|bust|busty)\b/gi,''],[/\bsee-?through\b/gi,'sheer-panel'],[/\blow-?cut\b/gi,'V-neck'],
];
const FRAME={en:'Professional e-commerce fashion try-on photo for a clothing catalog. The subject is an adult, fully clothed in exactly the reference garments (same design, color and cut, nothing added or removed), keeping the same identity, in a natural, relaxed, non-suggestive pose, in a tasteful studio or lifestyle setting.',
 zh:'服装电商的专业试穿照片，用于商品目录。人物是成年人，完整穿着参考图中的服装（款式、颜色、剪裁完全一致，不增不减），保持同一人的长相，姿势自然放松，场景为简洁的影棚或生活场景。'};
const neutralOn=()=>LS('wbNeutral')!==false;$('#wbNeutral').checked=neutralOn();$('#wbNeutral').onchange=e=>{SV('wbNeutral',e.target.checked);toast(e.target.checked?'已开启减少误拦截':'已关闭减少误拦截，将按原提示词发送')};
const isAdultJob=set=>[...W.garments,...(set||[])].some(g=>g.kind=='lib'&&A.ITEMS[g.k]&&A.ITEMS[g.k].a);
function neutralize(p){let t=p;for(const [a,b] of NEUTRAL)t=t.replace(a,b?'\x01'+b+'\x01':'\x02');
 t=t.replace(/\b(with|and|in)\s+\x02\s+(?:and|with)\b/gi,'$1').replace(/\x01\x02*\x01/g,'、').replace(/\x01\s+\x01/g,' ').replace(/[\x01]/g,'').replace(/\s*\x02\s*/g,' ')
  .replace(/(^|[，,、；;：:。.\n])\s*(?:and|with|,)?\s*(?=[，,、；;。.\n]|$)/g,'$1').replace(/([，、；])[，、；]+/g,'$1').replace(/([,;])\s*[,;]+/g,'$1').replace(/[ \t]{2,}/g,' ').replace(/\s+([,.;，。；、])/g,'$1').replace(/^[，,、]\s*|[，,、]\s*$/gm,'').replace(/[,，、]\s*([.。;；])/g,'$1');
 const zh=/[\u4e00-\u9fa5]/.test(t.slice(0,40))&&W.pl!='en';return FRAME[zh?'zh':'en']+'\n'+t}
function cfgFill(){
 const local=cfg.prov==='qwen';
 $('#provQwen').hidden=!qwenAvailable&&!local;
 for(const id of ['cfBase','cfKey','cfModel','cfProxy']) $('#'+id).closest('label').hidden=local;
 for(const id of ['cfConnection','cfAdvanced','cfKeyNote','cfClr']) $('#'+id).hidden=local;
 $$('[name=prov]').forEach(r=>r.checked=r.value==cfg.prov);const P=PROV[cfg.prov];$('#cfBase').value=cfg.base;$('#cfBase').placeholder=P.base||'https://你的中转地址/v1';$('#cfKey').value=cfg.key;$('#cfKey').placeholder=cfg.prov=='gemini'?'AIza…':'sk-… / 方舟 API Key';
 $('#cfModel').value=cfg.model;$('#cfModel').placeholder=P.model;$('#cfModels').innerHTML=P.models.map(m=>`<option value="${m}">`).join('');$('#cfField').value=cfg.field;$('#cfProto').value=cfg.proto;$('#cfProtoW').hidden=cfg.prov!='custom';$('#cfFieldW').hidden=!(cfg.prov=='custom'&&cfg.proto=='edits');$('#cfProxy').checked=cfg.proxy;$('#cfHelp').innerHTML=({openai:'在 <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a> 创建密钥；gpt-image-1 需要已验证的组织。',gemini:'在 <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> 免费获取 API Key（AIza 开头）。',seedream:'在 <a href="https://console.volcengine.com/ark" target="_blank" rel="noopener">火山方舟控制台</a> 开通 Seedream 模型并创建 API Key；会自动走本站代理。',qwen:'通过私有 NAS 媒体网关连接 3090。网关负责处理参考图和生成结果，密钥由本机服务读取。',custom:'填写中转商提供的 Base URL（通常以 /v1 结尾）与密钥，并按中转文档选择接口协议。'})[cfg.prov]||'';$('#cfMsg').textContent='';$('#cfMsg').className='fine'}
function cfgRead(){
 const prov=$('[name=prov]:checked')?.value||'openai';
 if(prov==='qwen')return{prov,base:'',key:'',model:'',field:'image[]',proto:'edits',proxy:false};
 return{prov,base:$('#cfBase').value.trim(),key:$('#cfKey').value.trim(),model:$('#cfModel').value.trim(),field:$('#cfField').value,proto:$('#cfProto').value,proxy:$('#cfProxy').checked}}
const cfgOpen=()=>{cfgFill();$('#cfg').hidden=false;document.body.style.overflow='hidden'},cfgClose=()=>{$('#cfg').hidden=true;document.body.style.overflow=''};
$('#wbCfg').onclick=cfgOpen;$('#wbCfg2').onclick=cfgOpen;$('#wbOnbGo').onclick=cfgOpen;$('#cfgX').onclick=cfgClose;$('#cfg').addEventListener('click',e=>{if(e.target.id=='cfg')cfgClose()});
$$('[name=prov]').forEach(r=>r.onchange=()=>{const o=cfgRead();Object.assign(cfg,o,{base:'',model:''});if(o.prov=='seedream')cfg.proxy=true;cfgFill();if(o.prov=='seedream')msg('火山方舟接口不允许浏览器跨域，已开启本站代理')});
$('#cfProto').onchange=()=>{cfg.proto=$('#cfProto').value;$('#cfFieldW').hidden=cfg.proto!='edits'};
$('#cfEye').onclick=()=>{const k=$('#cfKey');k.type=k.type=='password'?'text':'password';$('#cfEye').textContent=k.type=='password'?'显示':'隐藏'};
$('#cfSave').onclick=()=>{const o=cfgRead();if(o.prov=='custom'&&!o.base)return msg('自定义中转需要填写 Base URL',1);Object.assign(cfg,o);SV('wbCfg',cfg);render();cfgClose();toast('API 设置已保存在本机')};
$('#cfClr').onclick=()=>{cfg.key='';$('#cfKey').value='';SV('wbCfg',cfg);render();msg('已从本机清除密钥')};
function msg(t,bad){const m=$('#cfMsg');m.textContent=t;m.className='fine '+(bad?'bad':'good')}
$('#cfTest').onclick=async()=>{
 const o=cfgRead();
 if(o.prov==='qwen'){
  msg('正在检查 3090…');
  try{const info=await qwenRequest('check');msg('连接成功：'+info.model+' 可用')}
  catch(e){msg(e.message,1)}
  return;
 }
 if(!o.key)return msg('请先填写 API Key',1);if(o.prov=='custom'&&!o.base)return msg('请填写 Base URL',1);const old=Object.assign({},cfg);Object.assign(cfg,o);msg('正在连接…');
 try{const g=proto()=='gemini',url=g?`${root()}/models/${encodeURIComponent(modelOf())}`:`${root()}/models`;const r=await call(url,{method:'GET',headers:auth()});const j=await r.json().catch(()=>null);
  if(!r.ok){if(cfg.prov=='seedream'&&r.status==404){if((r.headers.get('content-type')||'').includes('text/html')){const e=Error('');e.zh='本站代理未生效：/api/proxy 返回的是网站静态页面而不是接口响应，Seedream 暂时连不上，请稍后再试或联系站长';throw e}return msg('地址可达、密钥已被接受（方舟不提供模型列表接口，可直接生成测试）')}throw await apiErr(r,j)}
  if(g)msg(`连接成功：模型 ${j&&j.displayName||modelOf()} 可用`);else{const ids=(j&&j.data||[]).map(m=>m.id),has=ids.includes(modelOf());msg(`连接成功：共 ${ids.length} 个模型`+(ids.length?(has?`，包含 ${modelOf()}`:`，但未找到 ${modelOf()}（中转可能不列出，可直接尝试）`):''))}}
 catch(e){msg(nice(e),1)}finally{Object.assign(cfg,old)}};
// ---------- 请求 ----------
function auth(){return proto()=='gemini'?{'x-goog-api-key':cfg.key}:{Authorization:'Bearer '+cfg.key}}
const p2=n=>String(n).padStart(2,'0'),stamp=d=>`${d.getFullYear()}${p2(d.getMonth()+1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
const OFF=/^(api\.openai\.com|generativelanguage\.googleapis\.com|ark\.[a-z0-9-]+\.(volces|bytepluses)\.com)$/;
function call(url,o){let hn='';try{hn=new URL(url).hostname}catch(e){}const cu=cfg.prov=='custom'||!OFF.test(hn);if(!cfg.proxy)return fetch(url,o);const h=new Headers(o.headers||{});h.set('x-target-url',url);if(cu)h.set('x-proxy-custom','1');return fetch('/api/proxy',Object.assign({},o,{headers:h}))}
async function fetchResult(url){let r=await fetch(url).catch(()=>null);if(!r||!r.ok)r=await fetch('/api/proxy',{headers:{'x-target-url':url,'x-proxy-kind':'image'}}).catch(()=>null);if(r&&r.ok)return r.blob();const e=Error('');e.zh='结果图片无法在浏览器中下载，请直接打开：'+url;throw e}

const SAFE_RE=/safety system|safety_violations|moderation_blocked|content_policy_violation|content policy|SensitiveContent|sensitive content|PROHIBITED_CONTENT|IMAGE_SAFETY|\bSAFETY\b|BLOCKLIST|SPII|blocked by|内容安全|敏感/i;
const CAT=[[/minor|child|CSAM/i,'涉及未成年人'],[/sexual|SEXUALLY_EXPLICIT|nudity|porn|色情/i,'性感/暴露内容'],[/violen|gore|血腥|暴力/i,'暴力或血腥'],[/self-?harm/i,'自残'],[/hate|HATE_SPEECH/i,'仇恨'],[/harass/i,'骚扰'],[/illicit|DANGEROUS/i,'危险或违法内容'],[/SPII|personal/i,'个人隐私信息'],[/copyright|RECITATION|trademark/i,'版权内容']];
function safeErr(raw,j,rid){const t=String(raw||'')+' '+JSON.stringify(j||'');if(!SAFE_RE.test(t))return null;const e=Error(String(raw||'safety'));const c=CAT.filter(x=>x[0].test(t)).map(x=>x[1]);
 e.safe={cats:[...new Set(c)],where:/InputImage|input image/i.test(t)?'in':/OutputImage|output/i.test(t)?'out':'',rid:rid||(t.match(/req_[A-Za-z0-9]+/)||[])[0]||''};
 let r=String(raw||'').trim();if(cfg.key)r=r.split(cfg.key).join('***');e.raw=r||t.slice(0,600);e.zh='被服务商的安全审核拦下了';return e}
async function apiErr(r,j){if(j===undefined)j=await r.json().catch(()=>null);const raw=(j&&(j.error&&(j.error.message||j.error.status||j.error)||j.message))||r.statusText||'';{const se=safeErr(typeof raw=='string'?raw:JSON.stringify(raw),j,(j&&j.error&&j.error.request_id)||r.headers.get('x-request-id'));if(se){se.status=r.status;return se}}
 const m={400:'请求参数有误：常见原因是模型不支持参考图、画幅尺寸不对或图片格式不支持，可换个模型或画幅再试',401:'密钥无效或已过期，请检查 API Key',403:'没有权限：密钥无此模型权限、账户未验证，或所在地区不受支持',404:'地址或模型不存在：请检查 Base URL 和模型名',413:'图片太大，请换一张更小的照片',429:'请求过于频繁或额度已用完，请稍后再试或检查账户余额',500:'服务商内部错误，请稍后重试',502:'网关错误（中转服务不可用）',503:'服务暂时不可用，请稍后重试',504:'服务商响应超时，请重试'}[r.status]||('请求失败（HTTP '+r.status+'）');
 let t=String(typeof raw=='string'?raw:JSON.stringify(raw));if(cfg.key)t=t.split(cfg.key).join('***');const bad=/API_KEY_INVALID|API key not valid|invalid api key|Incorrect API key|AuthenticationError|InvalidApiKey/i.test(t+' '+JSON.stringify(j||''));const ans=!bad&&t.match(/Argument not supported:\s*(\w+)/i);const e=Error(t);e.status=r.status;e.zh=(bad?'密钥无效或已过期，请检查 API Key':ans?`该服务商不支持 ${ans[1]} 参数：当前接口协议与它的规格对不上，请检查「接口协议」设置（xAI 请改选 xAI 协议）`:m)+(t?`\n服务商返回：${t.slice(0,300)}`:'');return e}
function nice(e){if(e.name=='AbortError')return'已取消';if(e instanceof TypeError)return'无法连接到服务商：网络不通，或该地址不允许浏览器跨域访问（CORS）。\n可在 API 设置中开启「通过本站代理转发」。';return e.zh||e.message||String(e)}
const AR={auto:null,'2:3':'1024x1536','3:4':'1024x1536','9:16':'1024x1536','1:1':'1024x1024','4:3':'1536x1024','16:9':'1536x1024'};
const SD={auto:'1728x2304','2:3':'1664x2496','3:4':'1728x2304','9:16':'1440x2560','1:1':'2048x2048','4:3':'2304x1728','16:9':'2560x1440'};
const resolution=$('#wbResolution');
const storedResolution=LS('wbResolution');
if(['1024','1536','2048'].includes(storedResolution))resolution.value=storedResolution;
function qwenSize(aspect,edge,base=null){
 const first=base||(isFace()&&W.faceBases[0])||W.persons[0];
 const [width,height]=aspect==='auto'?(first?[first.w,first.h]:[1,1]):aspect.split(':').map(Number);
 const longSide=Math.max(width,height);
 const side=value=>Math.max(256,Math.round(value/longSide*edge/32)*32);
 return `${side(width)}x${side(height)}`;
}
function updateQwenSizes(){
 $('#wbResField').hidden=cfg.prov!=='qwen';
 const aspect=$('#wbAR').value;
 for(const option of resolution.options)option.textContent=qwenSize(aspect,+option.value).replace('x','×');
}
resolution.onchange=()=>SV('wbResolution',resolution.value);
$('#wbAR').addEventListener('change',updateQwenSizes);
async function qwenRequest(action,options={}){
 let r;
 try{r=await fetch(QWEN_ENDPOINT+action,{method:'POST',...options})}
 catch(e){
  if(e.name==='AbortError')throw e;
  const error=Error('本地预览服务连接中断，请先核实 3090 的运行状态。');
  error.noRetry=true;
  throw error;
 }
 const data=await r.json().catch(()=>null);
 if(!r.ok||!data){
  const error=Error(data?.message||'本地 3090 接口不可用，请检查预览服务。');
  error.noRetry=r.status>=500;
  throw error;
 }
 return data;
}
async function qwenGenerate(imgs,prompt,ar,signal,base){
 if(imgs.length>MAX_REFERENCES)throw Error('3090 每次最多 4 张参考图，含原图、人物和其他参考。请减少参考图后重试。');
 const params={model:'qwen-image-2.1',prompt,n:1,output_format:'png',response_format:'b64_json'};
 params.size=qwenSize(ar,+resolution.value,base);
 const options={signal};
 if(imgs.length){
  const form=new FormData();
  for(const [key,value] of Object.entries(params))form.append(key,value);
  imgs.forEach((blob,i)=>form.append('image[]',blob,`ref-${i+1}.jpg`));
  options.body=form;
 }else{
  options.headers={'Content-Type':'application/json'};
  options.body=JSON.stringify(params);
 }
 return{blob:await openaiData(await qwenRequest('generate',options))};
}
const toB=async d=>(await fetch('data:image/png;base64,'+d)).blob();
async function openaiData(j){const d=j&&j.data&&j.data[0];if(!d){const e=Error('');e.zh='服务商没有返回图片数据'+(j&&j.error?'：'+(j.error.message||''):'');throw e}return d.b64_json?toB(d.b64_json):fetchResult(d.url)}
async function genOnce(imgs,prompt,sig,base){const ar=$('#wbAR').value,m=modelOf(),P=proto();let warn='';
 if(P==='qwen')return qwenGenerate(imgs,prompt,ar,sig,base);
 if(P=='gemini'){const parts=[{text:prompt}];for(const b of imgs)parts.push({inline_data:{mime_type:b.type||'image/jpeg',data:await b64(b)}});const gc={responseModalities:['TEXT','IMAGE']};if(ar!='auto')gc.imageConfig={aspectRatio:ar};
  const r=await call(`${root()}/models/${encodeURIComponent(m)}:generateContent`,{method:'POST',signal:sig,headers:Object.assign({'Content-Type':'application/json'},auth()),body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:gc})});
  const j=await r.json().catch(()=>null);if(!r.ok)throw await apiErr(r,j);const c=j&&j.candidates&&j.candidates[0],ps=((j&&j.candidates)||[]).flatMap(c=>(c.content&&c.content.parts)||[]),im=ps.find(p=>(p.inlineData||p.inline_data||{}).data);
  if(!im){const why=(j&&j.promptFeedback&&j.promptFeedback.blockReason)||(c&&c.finishReason);{const rs=(c&&c.safetyRatings||[]).filter(x=>x.blocked||/HIGH|MEDIUM/.test(x.probability||'')).map(x=>x.category).join(' ');const se=why&&/SAFETY|PROHIBITED|BLOCKLIST|SPII|OTHER/i.test(why)?safeErr(why+' '+rs+' '+((c&&c.finishMessage)||''),null,j&&j.responseId):null;if(se)throw se}const t=ps.map(p=>p.text).filter(Boolean).join(' ');const e=Error(t);e.zh='模型没有返回图片'+(why?`（${why}，可能触发了安全策略）`:'')+(t?'\n模型回复：'+t.slice(0,300):'');throw e}
  const d=im.inlineData||im.inline_data;return{blob:await(await fetch(`data:${d.mimeType||d.mime_type||'image/png'};base64,${d.data}`)).blob()}}
 const json=async(withImgs,extra)=>{const body=Object.assign({model:m,prompt,n:1},extra);if(withImgs&&imgs.length)body.image=await Promise.all(imgs.map(dataURL));
  const r=await call(`${root()}/images/generations`,{method:'POST',signal:sig,headers:Object.assign({'Content-Type':'application/json'},auth()),body:JSON.stringify(body)});const j=await r.json().catch(()=>null);if(!r.ok)throw await apiErr(r,j);return openaiData(j)};
 if(isFace()&&m==='dall-e-2')throw Error('此模型只接收一张参考图。请选择支持多图编辑的模型。');
 if(P=='seedream'){const ex={size:SD[ar]||SD.auto,response_format:'b64_json',watermark:false};if(/seedream-4/.test(m))ex.sequential_image_generation='disabled';try{return{blob:await json(true,ex)}}catch(e){if(!isFace()&&!e.safe&&e.status==400&&/image|参考/i.test(e.message)){warn='该模型没有接收参考图，结果只按文字生成，人物与服装可能对不齐。';return{blob:await json(false,ex),warn}}throw e}}
 if(P=='xai'){const body={model:m,prompt,n:1,response_format:'b64_json'};if(ar!='auto')body.aspect_ratio=ar;let used=imgs;
  if(imgs.length>5){used=imgs.slice(0,5);warn='xAI 参考图最多 5 张，已只发送前 5 张。'}
  if(used.length){const us=await Promise.all(used.map(dataURL));if(us.length==1)body.image={url:us[0]};else body.images=us.map(u=>({url:u}))}
  const r=await call(`${root()}/images/${used.length?'edits':'generations'}`,{method:'POST',signal:sig,headers:Object.assign({'Content-Type':'application/json'},auth()),body:JSON.stringify(body)});const j=await r.json().catch(()=>null);if(!r.ok)throw await apiErr(r,j);return{blob:await openaiData(j),warn}}
 const sz=AR[ar]||(/^gpt-image/.test(m)?'auto':'1024x1024');
 if(P=='json'||!imgs.length)return{blob:await json(!!imgs.length,{size:sz})};
 const edits=async field=>{const fd=new FormData();fd.append('model',m);fd.append('prompt',prompt);const one=/^dall-e-2$/.test(m);(one?imgs.slice(0,1):imgs).forEach((b,i)=>fd.append(field,b,`ref-${i+1}.jpg`));fd.append('n','1');fd.append('size',one&&sz=='auto'?'1024x1024':sz);
  const r=await call(`${root()}/images/edits`,{method:'POST',signal:sig,headers:auth(),body:fd});const j=await r.json().catch(()=>null);if(!r.ok)throw await apiErr(r,j);return openaiData(j)};
 const f0=cfg.prov=='custom'?cfg.field:'image[]';
 try{return{blob:await edits(f0)}}catch(e){if(e.name=='AbortError'||e.safe)throw e;if(/Argument not supported/i.test(e.message))throw e;
  if(e.status==400&&/image/i.test(e.message)&&!/safety|moderation|reject/i.test(e.message)){try{return{blob:await edits(f0=='image[]'?'image':'image[]'),warn:'已自动改用另一种图片字段名重试成功。'}}catch(x){}}
  if([404,405,415,501].includes(e.status)||/edits|not supported|unsupported|no such|invalid url/i.test(e.message)){try{return{blob:await json(true,{size:sz}),warn:'该接口不支持 images/edits，已自动改用 images/generations（JSON 多图）。'}}catch(x){if(x.name=='AbortError'||isFace())throw x;return{blob:await json(false,{size:sz}),warn:'该接口不支持参考图，结果只按文字生成，人物与服装可能对不齐。'}}}
  throw e}}
// ---------- 进度 ----------
let T0,tick,PR=0,done=0,total=1;function stage(t){$('#wbStage1').textContent=t}
function busy(on){$('#wbBusy').hidden=!on;$('#wbGo').classList.toggle('run',on);if(on)$('#wbGo').innerHTML='<i class="ring"></i>生成中…';$('#wbGo').disabled=on;clearInterval(tick);if(on){T0=Date.now();PR=.03;tick=setInterval(()=>{const s=(Date.now()-T0)/1e3,cap=(done+.95)/total;PR=Math.max(done/total,Math.min(cap,PR+(cap-PR)*.03));$('#wbProg').style.transform=`scaleX(${PR})`;$('#wbTime').textContent=`${Math.round(s)} 秒`+(total>1?` · 已完成 ${done} / ${total}`:'');},250)}else render()}
async function run(){if(W.busy)return;if(!configured()){toast('请先配置你的 API');return cfgOpen()}const missing=inputMissing();if(missing)return toast('请先选择'+missing);
 const face=isFace(), local=cfg.prov==='qwen';const ac=new AbortController();W.busy=ac;$('#wbErr').hidden=true;$('#wbWarn').hidden=true;
 const jobs=jobsForWorkspace();
 const custom=W.dirty?$('#wbPrompt').value.trim():null;
 const sharedPoseSet=jobs.every(job=>job.set===jobs[0].set);
 for(const job of jobs)job.prompt=custom&&sharedPoseSet?custom:compose(job.set);
 done=0;total=jobs.length;busy(true);stage('正在准备素材…');const errs=[],warns=new Set(),got=[];
 try{const pb=W.persons.map(p=>p.blob),rb=W.parts.map(p=>p.blob),gb=await Promise.all(usedGarments().map(assetBlob)),eb=await Promise.all(usedExpressions().map(assetBlob)),cache=new Map();const poseB=async p=>{const key=p.k+':'+p.ai;if(!cache.has(key))cache.set(key,assetBlob(p));return cache.get(key)};
  stage(total>1?`模型正在绘制… 共 ${total} 张`:'模型正在绘制…');
  let q=0;const worker=async()=>{while(q<jobs.length&&!ac.signal.aborted){const {set,base,prompt:prompt0}=jobs[q++];try{const imgs=[...(base?[base.blob]:[]),...pb,...gb,...await Promise.all(set.map(poseB)),...eb,...rb];const soft=!face&&neutralOn()&&!isAdultJob(set),prompt=soft?neutralize(prompt0):prompt0;W.lastSent=prompt;
    const jc=new AbortController(),onA=()=>jc.abort();ac.signal.addEventListener('abort',onA);let tmo=false;const tm=setTimeout(()=>{tmo=true;jc.abort()},window.__TMO||(local?240000:180000));let r;try{r=await genOnce(imgs,prompt,jc.signal,base)}catch(x){x.sent=prompt;if(tmo&&!ac.signal.aborted){const y=Error('timeout');y.zh=local?'3090 尚未返回结果，请先检查 Resident 的运行状态。':'等了 3 分钟还没有返回。服务商可能正忙，稍后点「重试」。';y.noRetry=local;throw y}throw x}finally{clearTimeout(tm);ac.signal.removeEventListener('abort',onA)}if(r.warn)warns.add(r.warn);const rec={t:Date.now()+Math.random(),prov:cfg.prov,model:modelOf(),prompt,orig:soft?prompt0:null,neutral:soft,mode:face?'face':W.mode,label:base?.name||set.map(p=>poseDesc(p,false).split('（')[0]).join(' / ')||'',before:base?.blob||pb[0]||null,after:r.blob};got.push(rec);await save(rec);W.results=got.slice();show(got.length-1)}
   catch(e){if(e.name=='AbortError')throw e;errs.push(e);if(local)return}finally{done++}}};
  await Promise.all(Array.from({length:Math.min(local?1:2,jobs.length)},worker));
  if(got.length){toast(got.length>1?`完成 ${got.length} 张`:'生成完成');hist()}if(errs.length){const e=errs.find(x=>x.safe)||errs[0];errBox(e,got.length?`${errs.length} 张生成失败`:'')}
  if(warns.size){$('#wbWarn').hidden=false;$('#wbWarn').textContent=[...warns].join(' ')}}
 catch(e){if(e.name=='AbortError'){toast(local?'已停止等待，3090 完成本次请求后会释放资源':'已取消生成');if(got.length)hist()}else errBox(e)}
 finally{W.busy=null;busy(false)}}
function errBox(e,head){const el=$('#wbErr');el.hidden=false;el.classList.toggle('safe',!!e.safe);
 if(e.safe){const S=e.safe,c=S.cats.length?`，原因是<b>${S.cats.join('、')}</b>`:'';const w=S.where=='in'?'上传的照片或服装图':S.where=='out'?'生成出来的图片':'这次请求';
  el.innerHTML=`<b>${head?head+' · ':''}被服务商的安全审核拦下了</b><p>${(PROV[cfg.prov]||{}).name||'服务商'} 判断${w}不合规${c}。真人照片配上比较暴露的服装（泳装、内衣、露背等）很容易被拦，OpenAI 审核最严，Gemini 和豆包 Seedream 相对宽松一些。</p><p class="fine">可以换一家服务商，或换一套遮挡多一点的服装。原样重试大多还会被拦。</p><div class="row"><button class="sm" data-ef="prov">换服务商重试</button><button class="sm ghost" data-ef="cos">换一套服装</button><button class="sm ghost" id="wbRetry">重试</button></div>${neutralOn()?'':'<div class="row"><button class="sm" data-ef="neutral">打开减少误拦截后重试</button></div>'}<details class="raw"><summary>查看原始信息</summary><pre>${esc(e.raw+(S.rid&&!e.raw.includes(S.rid)?'\nrequest id: '+S.rid:'')+(e.sent?'\n\n实际发送的提示词'+(neutralOn()?'（已开启减少误拦截）':'')+'：\n'+e.sent:''))}</pre><button class="sm ghost" data-ef="copy">复制</button></details>`;return}
 el.innerHTML=`<b>${head||'生成失败'}</b><p>${esc(nice(e)).replace(/\n/g,'<br>')}</p><div class="row">${e.noRetry?'':'<button class="sm" id="wbRetry">重试</button>'}<button class="sm ghost" data-open-cfg>检查 API 设置</button></div>`}
$('#wbStage').addEventListener('click',e=>{const f=e.target.closest('[data-ef]');if(f){const k=f.dataset.ef;if(k=='prov'){cfgOpen();const p=$('#cfg .prov');p.scrollIntoView({block:'start'});p.classList.remove('hl');void p.offsetWidth;p.classList.add('hl');const o=$('[name=prov]:not(:checked)');o&&o.focus()}if(k=='cos')picker('costume');if(k=='neutral'){SV('wbNeutral',true);$('#wbNeutral').checked=true;run()}if(k=='copy')A.copy?A.copy(f.previousElementSibling.textContent):navigator.clipboard.writeText(f.previousElementSibling.textContent).then(()=>toast('已复制'));return}if(e.target.id=='wbRetry')run();if(e.target.closest('[data-open-cfg]'))cfgOpen()});
$('#wbGo').onclick=run;$('#wbAgain').onclick=run;$('#wbStop').onclick=()=>W.busy&&W.busy.abort();
// ---------- 结果 ----------
let urls=[];const ru=new Map();const U=b=>{if(!ru.has(b))ru.set(b,URL.createObjectURL(b));return ru.get(b)};
function show(i,meta){const r=W.results[i];if(!r)return;{let d=$('#wbSentD');if(!d){d=document.createElement('details');d.id='wbSentD';d.className='raw sent';$('#wbOutAct').after(d)}d.hidden=!r.prompt;d.innerHTML=r.prompt?`<summary>查看原始信息${r.neutral?' · 已减少误拦截':''}</summary><pre>${esc((r.orig?'原提示词：\n'+r.orig+'\n\n实际发送：\n':'实际发送：\n')+r.prompt)}</pre>`:''}W.ri=i;const a=U(r.after),hasB=!!r.before;$('#wbAfter').src=a;if(hasB)$('#wbBefore').src=U(r.before);$('#wbCmp').hidden=false;$('#wbCmp').classList.toggle('solo',!hasB||!W.cmp);$('#wbCmpT').hidden=!hasB;$('#wbCmpT').textContent=W.cmp?'关闭对比':'前后对比';
 $('#wbPh0').hidden=true;$('#wbErr').hidden=true;$('#wbOutAct').hidden=false;setX(50);$('#wbZip').hidden=W.results.length<2;if(!matchMedia('(prefers-reduced-motion: reduce)').matches){$('#wbAfter').animate([{opacity:0,transform:'scale(1.03)',filter:'blur(8px)'},{opacity:1,transform:'none',filter:'none'}],{duration:620,easing:'cubic-bezier(.16,1,.3,1)'});if(hasB&&W.cmp&&!W._wig){W._wig=1;const t0=performance.now();const f=t=>{const p=(t-t0)/1400;if(p>=1)return setX(50);setX(50+Math.sin(p*Math.PI*2)*12*(1-p));requestAnimationFrame(f)};setTimeout(()=>requestAnimationFrame(f),500)}}$('#wbMeta').textContent=meta||((PROV[r.prov]||{name:r.prov}).name+' · '+r.model+(r.label?' · '+r.label:''));
 const R=$('#wbRes');R.hidden=W.results.length<2;R.innerHTML=W.results.map((x,j)=>`<button data-ri="${j}" class="${j==i?'on':''}"><img src="${U(x.after)}" alt="结果 ${j+1}"></button>`).join('')}
$('#wbRes').onclick=e=>{const b=e.target.closest('[data-ri]');b&&show(+b.dataset.ri)};$('#wbCmpT').onclick=()=>{W.cmp=!W.cmp;show(W.ri)};
$('#wbZip').onclick=async()=>{if(!window.makeZip)return;const ts=stamp(new Date());const fs=W.results.map((r,i)=>({name:`posewear-${r.mode==='face'?'face':r.mode==='gen'?'gen':'tryon'}-${ts}-${String(i+1).padStart(2,'0')}.png`,blob:r.after}));window.X.dl(await makeZip(fs),`posewear-tryon-${ts}.zip`);toast(`已打包 ${fs.length} 张`)};
$('#cfExp').onclick=()=>{const withKey=confirm('导出时包含 API Key 吗？\n确定 = 包含，取消 = 不含密钥');const o={...cfg};if(!withKey)delete o.key;window.X.dl(new Blob([JSON.stringify({app:'衣姿 PoseWear',type:'api-config',cfg:o},null,2)],{type:'application/json'}),'衣姿-API设置.json');msg('已导出设置'+(withKey?'（含密钥，请妥善保管）':'（不含密钥）'))};
$('#cfImp').onclick=()=>$('#cfImpF').click();$('#cfImpF').onchange=async e=>{try{const j=JSON.parse(await e.target.files[0].text());const o=j.cfg||j;if(!PROV[o.prov]||(o.prov==='qwen'&&!qwenAvailable))throw 0;Object.assign(cfg,o);SV('wbCfg',cfg);cfgFill();render();msg('已导入设置')}catch(err){msg('导入失败：文件格式不正确',1)}e.target.value=''};
$('#wbSaveAsset').onclick=()=>window.AssetLibrary?.save(W.results, W.ri);
$('#wbDl').onclick=()=>{const r=W.results[W.ri];if(!r)return;const l=document.createElement('a');l.href=U(r.after);l.download=`posewear-${r.mode==='face'?'face':r.mode==='gen'?'gen':'tryon'}-${stamp(new Date(r.t))}-${String(W.ri+1).padStart(2,'0')}.png`;l.click()};
$('#wbUse').onclick=async()=>{const r=W.results[W.ri];if(!r)return;if(isFace()){await addFaceBases([{blob:r.after,name:'生成结果'}]);return}const x=await toJpeg(U(r.after),1536);W.persons=[{blob:x.blob,url:URL.createObjectURL(x.blob),w:x.w,h:x.h}];W.mode='tryon';render();toast('已将结果设为新的人物照片')};
function setX(x){$('#wbCmp').style.setProperty('--x',x+'%');$('#wbRange').value=x}$('#wbRange').oninput=e=>setX(e.target.value);
// ---------- IndexedDB ----------
let dbp;const db=()=>dbp||(dbp=new Promise((r,j)=>{const q=indexedDB.open('lk-studio',1);q.onupgradeneeded=()=>q.result.createObjectStore('h',{keyPath:'t'});q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)}));
const tx=async(m,f)=>{const d=await db();return new Promise((r,j)=>{const t=d.transaction('h',m),s=t.objectStore('h'),q=f(s);t.oncomplete=()=>r(q&&q.result);t.onerror=()=>j(t.error)})};
async function save(rec){try{await tx('readwrite',s=>s.put(rec));const all=await tx('readonly',s=>s.getAllKeys());if(all.length>40)await tx('readwrite',s=>{all.slice(0,all.length-40).forEach(k=>s.delete(k))})}catch(e){}}
let hu=[];async function hist(){let L=[];try{L=(await tx('readonly',s=>s.getAll()))||[]}catch(e){}L.sort((a,b)=>b.t-a.t);hu.forEach(URL.revokeObjectURL);hu=[];
 $('#wbHist').innerHTML=L.length?L.map(r=>{const u=URL.createObjectURL(r.after);hu.push(u);return`<button data-t="${r.t}" title="${esc(new Date(r.t).toLocaleString('zh-CN')+(r.label?' · '+r.label:''))}"><img src="${u}" alt="历史结果"><span>${r.mode==='face'?'换脸':r.mode==='gen'?'生图':'试穿'} · ${esc(new Date(r.t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}))}</span><i data-del="${r.t}" aria-label="删除">×</i></button>`}).join(''):'<p class="fine">还没有生成记录</p>';W.hist=L}
$('#wbHist').onclick=async e=>{const d=e.target.closest('[data-del]');if(d){e.stopPropagation();const rec=(W.hist||[]).find(x=>x.t==d.dataset.del);await tx('readwrite',s=>s.delete(+d.dataset.del));await hist();if(rec)toast('已删除 1 条记录',async()=>{await tx('readwrite',s=>s.put(rec));hist()});return}const b=e.target.closest('[data-t]');if(!b)return;const r=W.hist.find(x=>x.t==b.dataset.t);if(r){W.results=[r];show(0,(PROV[r.prov]||{name:r.prov}).name+' · '+r.model+' · '+new Date(r.t).toLocaleString('zh-CN'));$('#wbStage').scrollIntoView({behavior:'smooth',block:'nearest'})}};
$('#wbHClr').onclick=async()=>{const all=W.hist||[];if(!all.length)return toast('还没有生成记录');await tx('readwrite',s=>s.clear());await hist();toast(`已清空 ${all.length} 条记录`,async()=>{await tx('readwrite',s=>{all.forEach(r=>s.put(r))});hist()})};
// ---------- 对外 ----------
let inited=false;async function init(){if(inited)return;inited=true;const gk=[].concat(g0.g||[]),pk=(g0.p||[]).filter(x=>Array.isArray(x)),ek=(g0.e||[]).filter(x=>Array.isArray(x));const need=[gk.length&&'costume',gk.some(k=>k[0]=='a')&&'anime',pk.some(([k])=>k?.startsWith('p:'))&&'pose',pk.some(([k])=>k?.startsWith('d:'))&&'depth',ek.length&&'expr'].filter(Boolean);if(need.length)await Promise.all(need.map(A.load)).catch(()=>{});
 if(!W.garments.length)W.garments=gk.filter(k=>A.ITEMS[k]).slice(0,1).map(k=>({kind:'lib',k}));if(!W.poses.length)W.poses=pk.filter(x=>A.ITEMS[x[0]]).slice(0,6).map(x=>({kind:'lib',k:x[0],ai:x[1]??A.ITEMS[x[0]].ai}));if(!W.exprs.length)W.exprs=ek.filter(x=>A.ITEMS[x[0]]).slice(0,1).map(x=>({kind:'lib',k:x[0],ai:x[1]??A.ITEMS[x[0]].ai}));hist()}
window.WB={useWorkspace,addPersons,addAssetPersons,addParts,addFaceBases,referenceSlots,async show(){await init();render()},async pick(it){await init();useWorkspace('tryon');if(it.type=='pose'||it.type=='depth'){if(!W.poses.some(p=>p.k==it.k)){if(W.poses.length>=6)W.poses.shift();W.poses.push({kind:'lib',k:it.k,ai:it.ai})}toast(`已加入姿势参考（${W.poses.length} 个）`)}else if(it.type=='portrait'){await addPortrait(it)}else if(it.type=='expr'){W.exprs=[{kind:'lib',k:it.k,ai:it.ai}];toast('已加入表情参考（只取神态）')}else{W.garments=[{kind:'lib',k:it.k}];toast('已选为试穿服装')}if(A.workbenchOpen())render();else A.setTab('studio')},_W:W,_cfg:cfg};
if(A.workbenchOpen())WB.show();
if(location.hash=='#studio'){const t0=()=>scrollTo(0,0);requestAnimationFrame(t0);addEventListener('load',()=>setTimeout(t0,0),{once:true})}
if(['localhost','127.0.0.1'].includes(location.hostname)){
 fetch(QWEN_ENDPOINT+'status').then(r=>r.ok?r.json():null).then(info=>{
  if(!info?.enabled)return;
  qwenAvailable=true;
  $('#provQwen').hidden=false;
  if(!storedCfg&&cfg.prov==='openai'&&!cfg.key&&$('#cfg').hidden)cfg.prov='qwen';
  if(A.workbenchOpen())render();
 }).catch(()=>{});
}
addEventListener('keydown',e=>{if(e.key=='Escape'){if(!$('#pk').hidden)pkClose();else if(!$('#cfg').hidden)cfgClose()}});
})();
// v10：手机端把密钥引导卡放到第 1 步之前
(()=>{const mq=matchMedia('(max-width:760px)'),o=document.getElementById('wbOnb');if(!o)return;const place=()=>{if(mq.matches){const s1=document.querySelector('.st-l [data-s="1"]');s1&&s1.parentNode.insertBefore(o,s1)}else document.querySelector('.st-c').prepend(o)};place();mq.addEventListener('change',place)})();
