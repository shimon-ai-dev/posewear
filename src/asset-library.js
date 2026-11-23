'use strict';
(()=>{
const A=window.APP, $=id=>document.getElementById(id);
const API={assets:'/api/local-assets',faces:'/api/local-face-bases',parts:'/api/local-parts'};
const names={assets:'人物资产',faces:'换脸库',parts:'部位'};
const groupNames={assets:'人物',faces:'原图组',parts:'部位'};
const collectionFor=view=>view==='local-portraits'?'assets':view;
const uploadName={assets:'上传人像',faces:'上传换脸原图',parts:'上传部位图'};
const dialog=$('assetSave'), form=$('assetForm'), message=$('assetSaveMessage');
const personField=$('assetPerson'), personFilter=$('assetPersonFilter'), tagFilter=$('assetTagFilter');
const nameDialog=$('assetNameDialog'), picker=$('assetPicker');
const pickPerson=$('assetPickPerson'), pickTag=$('assetPickTag'), pickMessage=$('assetPickMessage');
const pickSource=$('assetPickSource');
const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
const catalogs={assets:[],faces:[],parts:[]}, lastPerson={assets:'',faces:'',parts:''};
let view='assets', library='assets', activeType='whole', activePerson='', editLibrary='assets', mode='save', selected=[], batch=[], editing=null;
let naming=null, saving=false, creating=false, picking=false, pickKind='person', pickLibrary='assets', pickPage=0;
const picked=new Set();

async function request(path='',options,collection=library){
 const response=await fetch(API[collection]+path,options);
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data)throw Error(data?.message||'本地资产库不可用，请检查预览服务。');
 return data;
}
const post=(path,data,collection)=>request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)},collection);
const personById=(id,collection=library)=>catalogs[collection].find(person=>person.id===id);
const fileUrl=(id,collection=library)=>API[collection]+'/image/'+encodeURIComponent(id);
const boxes=()=>[...$('assetLabels').querySelectorAll('input:checked')].map(input=>input.value);

function options(select, entries, selectedId, placeholder){
 select.replaceChildren();
 if(placeholder)select.add(new Option(placeholder,''));
 for(const entry of entries)select.add(new Option(entry.name,entry.id));
 if(entries.some(entry=>entry.id===selectedId))select.value=selectedId;
}
function setTags(select,person,value){
 options(select,person?.labels||[],value,'全部标签');
}
const sourceName=(photo,collection=library)=>collection==='faces'?'换脸原图':collection==='parts'?'部位参考':photo.kind==='reference'?'本地上传':'工作台生成';
function listedPhotos(person,source,tag=''){
 const kind={uploaded:'reference',generated:'generated'}[source];
 return (person?.photos||[]).filter(photo=>(!kind||photo.kind===kind)&&(!tag||photo.labels.includes(tag)));
}
function photoCard(photo,person){
 const url=fileUrl(photo.id), title=A.esc(photo.name);
 const filename=A.esc(`${person.name}-${photo.id.slice(0,8)}.${extensions[photo.mime]}`);
 const labelNames=person.labels.filter(label=>photo.labels.includes(label.id));
 return `<article class="asset-card">
  <a href="${url}" target="_blank" rel="noopener" aria-label="查看 ${title} 原图"><img src="${url}" alt="${title}" loading="lazy"></a>
  <div class="info"><h2>${title}</h2><p class="asset-source" data-source="${photo.kind}">${sourceName(photo)}</p>
   <div class="tags">${labelNames.map(label=>`<span class="tag">${A.esc(label.name)}</span>`).join('')}</div>
   <div class="row"><button class="sm" data-edit="${photo.id}">编辑标签</button><a href="${url}" download="${filename}">下载</a></div>
  </div></article>`;
}

function render(){
 const people=catalogs[library], localPortraits=view==='local-portraits';
 activePerson=personById(activePerson)?.id||people[0]?.id||'';
 const person=personById(activePerson);
 $('assetsTitle').textContent=localPortraits?'本地人像':names[library];
 $('assetHead').hidden=localPortraits;
 $('assetCreatePerson').textContent='新建'+groupNames[library];
 $('assetTypeField').hidden=view!=='assets';
 for(const button of document.querySelectorAll('[data-asset-type]')){
  const active=button.dataset.assetType===activeType;
  button.classList.toggle('on',active);
  button.setAttribute('aria-pressed',active);
 }
 $('assetPersonCaption').textContent=groupNames[library];
 options(personFilter,people,activePerson);
 setTags(tagFilter,person,tagFilter.value);
 $('assetUpload').textContent=library==='assets'?'上传或补充人像':uploadName[library];
 $('assetUpload').hidden=localPortraits;
 $('assetControls').hidden=!person;
 const photos=listedPhotos(person,view==='assets'?activeType:'uploaded',tagFilter.value);
 $('assetNotice').textContent=photos.length?'共 '+photos.length+' 张':person
  ? '这个分组还没有图片。'
  : localPortraits?'上传时可选择已有的人物，或新建人物。':'先新建'+groupNames[library]+'，再上传图片。';
 $('assetGrid').innerHTML=photos.map(photo=>photoCard(photo,person)).join('');
}

async function refresh(collection=library){
 const data=await request('',undefined,collection);
 if(!Array.isArray(data.people))throw Error('本地资产目录格式无效。');
 catalogs[collection]=data.people;
 if(collection===library)render();
 if($('assetsTab').hidden){
  for(const id of ['assetsTab','facesTab','partsTab','wbSaveAsset','wbPickAsset','wbPartStep','wbPickFace'])$(id).hidden=false;
  A.selectTab(A.st.tab);
 }
}
function show(nextView,type){
 if(nextView!==view){
  lastPerson[library]=activePerson;
  view=nextView;
  library=collectionFor(view);
  activePerson=lastPerson[library];
  tagFilter.value='';
 }
 activeType=['uploaded','generated'].includes(type)?type:'whole';
 render();
 return refresh().catch(error=>{if(view===nextView)$('assetNotice').textContent=error.message});
}

personFilter.onchange=()=>{activePerson=personFilter.value;tagFilter.value='';render()};
tagFilter.onchange=render;
for(const button of document.querySelectorAll('[data-asset-type]')){
 button.onclick=()=>{
  activeType=button.dataset.assetType;
  history.replaceState(null,'',activeType==='whole'?'#assets':'#assets/'+activeType);
  tagFilter.value='';
  render();
 };
}

function renderLabels(person,chosen=[]){
 $('assetNewTag').disabled=!person;
 $('assetLabels').innerHTML=person?.labels.length
  ? person.labels.map(tag=>`<label class="asset-choice"><input type="checkbox" value="${tag.id}" ${chosen.includes(tag.id)?'checked':''}><span>${A.esc(tag.name)}</span></label>`).join('')
  : '<span class="fine">还没有标签</span>';
}

function openEditor(kind,photo=null,collection=kind==='save'?'assets':library){
 mode=kind;
 editing=photo;
 editLibrary=collection;
 form.reset();
 message.textContent='';
 message.className='fine';
 const upload=mode==='upload', edit=mode==='edit';
 const group=groupNames[editLibrary], target=photo?.person||(editLibrary===library?activePerson:lastPerson[editLibrary]);
 $('assetSaveTitle').textContent=edit?'编辑标签':upload?uploadName[editLibrary]:'保存到人物资产';
 $('assetDestination').hidden=edit;
 $('assetDestinationCaption').textContent=group;
 $('assetNewPerson').textContent='新建'+group;
 personField.required=!edit;
 options(personField,catalogs[editLibrary],target,'选择'+group);
 $('assetBatch').hidden=mode!=='save'||batch.length<2;
 $('assetUploadField').hidden=!upload;
 $('assetUploadFiles').required=upload;
 renderLabels(personById(personField.value,editLibrary),photo?.labels||(upload&&editLibrary===library&&tagFilter.value?[tagFilter.value]:[]));
 dialog.showModal();
}

personField.onchange=()=>renderLabels(personById(personField.value,editLibrary));
$('assetGrid').onclick=event=>{
 const button=event.target.closest('[data-edit]');
 const photo=personById(activePerson)?.photos.find(image=>image.id===button?.dataset.edit);
 if(photo)openEditor('edit',photo);
};

function name(kind,personId,done,collection=library){
 naming={kind,personId,done,collection};
 $('assetNameTitle').textContent=kind==='people'?'新建'+groupNames[collection]:'新建标签';
 $('assetName').value='';
 $('assetName').maxLength=kind==='people'?80:40;
 $('assetNameMessage').textContent='';
 nameDialog.showModal();
}
$('assetNameCancel').onclick=()=>{if(!creating)nameDialog.close()};
nameDialog.addEventListener('cancel',event=>{if(creating)event.preventDefault()});
$('assetNameForm').onsubmit=async event=>{
 event.preventDefault();
 if(creating)return;
 creating=true;
 $('assetNameConfirm').disabled=true;
 const {kind,personId,done,collection}=naming;
 try{
  const result=await post('/'+kind,{name:$('assetName').value.trim(),person:personId},collection);
  await refresh(collection);
  nameDialog.close();
  done(result.id);
 }catch(error){$('assetNameMessage').textContent=error.message}
 finally{creating=false;$('assetNameConfirm').disabled=false}
};

$('assetCreatePerson').onclick=()=>{
 name('people',null,id=>{activePerson=id;tagFilter.value='';render()});
};
$('assetCreateTag').onclick=()=>name('labels',activePerson,id=>{setTags(tagFilter,personById(activePerson),id);render()});
$('assetUpload').onclick=()=>openEditor('upload');
$('portraitUpload').onclick=async()=>{
 try{await refresh('assets');openEditor('upload',null,'assets')}
 catch(error){A.toast(error.message)}
};
$('assetNewPerson').onclick=()=>name('people',null,id=>{
 options(personField,catalogs[editLibrary],id,'选择'+groupNames[editLibrary]);
 renderLabels(personById(id,editLibrary));
},editLibrary);
$('assetNewTag').onclick=()=>{
 const target=personField.value, checked=boxes();
 name('labels',target,id=>renderLabels(personById(target,editLibrary),[...checked,id]),editLibrary);
};

async function savePhoto(person,labels,kind,blob,title,source=''){
 const body=new FormData();
 for(const [key,value] of Object.entries({person,labels:JSON.stringify(labels),kind,name:title,source}))body.append(key,value);
 body.append('image',blob,'asset.'+(extensions[blob.type]||'png'));
 return request('',{method:'POST',body},editLibrary);
}

$('assetCancel').onclick=()=>{if(!saving)dialog.close()};
dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault()});
form.onsubmit=async event=>{
 event.preventDefault();
 if(saving)return;
 saving=true;
 $('assetConfirm').disabled=true;
 $('assetCancel').disabled=true;
 message.className='fine';
 message.textContent='正在保存…';
 let saved=0;
 try{
  const labels=boxes(), person=personField.value;
  if(labels.length>20)throw Error('每张图最多选择 20 个标签。');
  if(mode==='edit'){
   await post('/tags',{id:editing.id,labels},editLibrary);
  }else{
   if(!person)throw Error('请先选择'+groupNames[editLibrary]+'。');
   if(mode==='upload'){
    for(const file of $('assetUploadFiles').files){
     await savePhoto(person,labels,'reference',file,Array.from(file.name).slice(0,120).join(''));
     saved++;
    }
   }else{
    const results=$('assetSaveAll').checked?batch:selected;
    for(const result of results){
     await savePhoto(person,labels,'generated',result.after,'生成图',String(result.t));
     saved++;
    }
   }
   lastPerson[editLibrary]=person;
   if(editLibrary===library){
    activePerson=person;
    if(A.st.tab==='assets'&&!A.workbenchOpen()){
     activeType=mode==='upload'?'uploaded':'generated';
     history.replaceState(null,'','#assets/'+activeType);
    }
    tagFilter.value='';
   }
  }
  dialog.close();
  A.toast(mode==='edit'?'标签已更新':`已保存 ${saved} 张到${names[editLibrary]}`);
  await refresh(editLibrary);
 }catch(error){
  message.className='fine bad';
  message.textContent=(saved?`已保存 ${saved} 张。`:'')+error.message;
 }finally{
  saving=false;
  $('assetConfirm').disabled=false;
  $('assetCancel').disabled=false;
 }
};

function pickedStatus(){
 const max=window.WB.referenceSlots(pickKind);
 pickMessage.textContent=catalogs[pickLibrary].length?`已选 ${picked.size} 张，可再加入 ${Math.max(0,max-picked.size)} 张`:
  '先在'+names[pickLibrary]+'创建'+groupNames[pickLibrary]+'并上传图片。';
 $('assetPickConfirm').disabled=!picked.size||picking;
}
function renderPicker(){
 const person=personById(pickPerson.value,pickLibrary);
 const localPeople=pickKind==='person';
 $('assetPickSourceField').hidden=!localPeople;
 setTags(pickTag,person,pickTag.value);
 const words=A.searchTerms($('assetPickSearch').value);
 const matches=listedPhotos(person,localPeople?pickSource.value:'uploaded',pickTag.value).filter(photo=>{
  const labels=person.labels.filter(label=>photo.labels.includes(label.id)).map(label=>label.name);
  const text=[person.name,photo.name,sourceName(photo,pickLibrary),...labels].join(' ').toLowerCase();
  return words.every(word=>text.includes(word));
 });
 const page=A.paginate(matches,pickPage);
 pickPage=page.current;
 $('assetPickCount').textContent=page.total?`共 ${page.total} 张 · ${page.current+1} / ${page.pages} 页`:'共 0 张';
 $('assetPickPrev').disabled=page.current===0;
 $('assetPickNext').disabled=page.current+1>=page.pages;
 $('assetPickGrid').innerHTML=page.items.map(photo=>`<label class="asset-pick">
  <img src="${fileUrl(photo.id,pickLibrary)}" alt="" loading="lazy">
  <span><input type="checkbox" value="${photo.id}" ${picked.has(photo.id)?'checked':''}>${A.esc((pickKind==='part'?person.name:sourceName(photo,pickLibrary))+' · '+photo.name)}</span>
 </label>`).join('');
 $('assetPickGrid').scrollTop=0;
 pickedStatus();
}
async function openPicker(kind){
 if(window.WB.referenceSlots(kind)<=0)return A.toast('参考图数量已满，请先移除一张。');
 pickKind=kind;
 const face=kind==='face';
 pickLibrary=face?'faces':kind==='part'?'parts':'assets';
 $('assetPickerTitle').textContent=face?'选择换前原图':kind==='part'?'选择部位参考图':'选择本地人物参考图';
 $('assetPickPersonCaption').textContent=groupNames[pickLibrary];
 $('assetPickManage').textContent=face?'管理换脸库':kind==='part'?'管理部位':'管理本地人像';
 $('assetPickManage').href=face?'#faces':kind==='part'?'#parts':'#portrait/uploads';
 try{await refresh(pickLibrary)}catch(error){return A.toast(error.message)}
 picked.clear();
 options(pickPerson,catalogs[pickLibrary],pickLibrary===library?activePerson:lastPerson[pickLibrary],'选择'+groupNames[pickLibrary]);
 pickTag.value='';
 pickSource.value='whole';
 $('assetPickSearch').value='';
 resetPicker();
 picker.showModal();
}
$('wbPickAsset').onclick=()=>openPicker('person');
$('wbPickPart').onclick=()=>openPicker('part');
$('wbPickFace').onclick=()=>openPicker('face');
function resetPicker(){pickPage=0;renderPicker()}
pickPerson.onchange=()=>{picked.clear();pickTag.value='';resetPicker()};
pickTag.onchange=pickSource.onchange=$('assetPickSearch').oninput=resetPicker;
$('assetPickPrev').onclick=()=>{pickPage--;renderPicker()};
$('assetPickNext').onclick=()=>{pickPage++;renderPicker()};
$('assetPickGrid').onchange=event=>{
 const input=event.target;
 if(input.checked){
  if(picked.size>=window.WB.referenceSlots(pickKind)){
   input.checked=false;
   pickMessage.textContent='已达到本次参考图数量上限。';
   return;
  }
  picked.add(input.value);
 }else picked.delete(input.value);
 pickedStatus();
};
$('assetPickCancel').onclick=()=>{if(!picking)picker.close()};
$('assetPickManage').onclick=event=>{if(picking)event.preventDefault();else picker.close()};
picker.addEventListener('cancel',event=>{if(picking)event.preventDefault()});
$('assetPickForm').onsubmit=async event=>{
 event.preventDefault();
 if(picking||!picked.size)return;
 picking=true;
 pickedStatus();
 try{
  const owner=personById(pickPerson.value,pickLibrary);
  const refs=await Promise.all([...picked].map(async id=>{
   const response=await fetch(fileUrl(id,pickLibrary));
   if(!response.ok)throw Error('无法读取选中的参考图。');
   const photo=owner.photos.find(image=>image.id===id);
   return {blob:await response.blob(), name:photo.name, part:pickKind==='part'?owner.name:'', source:sourceName(photo,pickLibrary)};
  }));
  const count=pickKind==='face'?await window.WB.addFaceBases(refs):pickKind==='part'?await window.WB.addParts(refs):await window.WB.addAssetPersons(refs);
  if(!count)throw Error('未能加入图片，请检查参考图数量。');
  A.toast(`已加入 ${count} 张${pickKind==='face'?'换前原图':pickKind==='part'?'部位参考图':'人物参考图'}`);
  picker.close();
 }catch(error){pickMessage.textContent=error.message}
 finally{picking=false;$('assetPickConfirm').disabled=!picked.size}
};

window.AssetLibrary={
 show,
 save(results,index){
  if(saving||!results[index]?.after)return;
  selected=[results[index]];
  batch=results.filter(result=>result.after);
  openEditor('save');
 }
};
if(A.st.tab==='local-portraits'||API[A.st.tab])show(A.st.tab,location.hash.split('/')[1]);
else if(['127.0.0.1','localhost'].includes(location.hostname))refresh('assets').catch(()=>{});
})();
