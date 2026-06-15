// ==UserScript==
// @name         东软答题助手
// @namespace    neusoft-auto-answer
// @version      1.0
// @description  自动答题：单选/多选/判断，支持手动选中、自动翻页
// @author       github.com/j84102273-dot/neusoft-auto-answer
// @match        https://study.neusoft.edu.cn/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
'use strict';

function boot() {
  if (document.getElementById('aa')) return;
  if (!document.querySelector('.el-radio-group') && !document.querySelector('.el-checkbox-group')) {
    setTimeout(boot, 1000);
    return;
  }

// ===== 样式 =====
var style=document.createElement('style');
style.textContent='.aa-sel{outline:3px dashed #9b59b6!important;outline-offset:3px;background:rgba(155,89,182,.05)!important}.aa-ans{outline:2px solid #00d4aa!important;outline-offset:2px}.aa-ok{outline:2px solid #2ecc71!important;outline-offset:2px}.aa-err{outline:2px solid #e74c3c!important;outline-offset:2px}.aa-qbox{cursor:pointer}';
document.head.appendChild(style);

// ===== UI =====
document.body.insertAdjacentHTML('beforeend',
'<div id=aa style="position:fixed;top:70px;right:10px;z-index:99999;background:#1a1a2e;color:#eee;border-radius:12px;padding:12px;width:300px;font:13px system-ui;box-shadow:0 4px 24px rgba(0,0,0,.5)">'+
'<div style="text-align:center;color:#555;font-size:10px;margin-bottom:6px;cursor:move">⋮⋮ 任意位置拖动 ⋮⋮</div>'+
'<button id=aa-close style="position:absolute;top:8px;right:10px;background:none;border:none;color:#888;font-size:18px;cursor:pointer;padding:0 4px;line-height:1">✕</button>'+
'<h3 style="color:#00d4aa;margin:0 0 8px;font-size:14px">🤖 答题助手</h3>'+
'<div id=aa-stats style="font-size:11px;color:#888;margin-bottom:6px;padding:6px;background:#16213e;border-radius:4px;text-align:center;line-height:1.6"></div>'+
'<div style="display:flex;gap:4px;margin-bottom:4px">'+
'<button id=aa-go style="flex:1;padding:8px;border:none;border-radius:6px;cursor:pointer;background:#00d4aa;color:#000;font-weight:600;font-size:12px">▶ 答全部</button>'+
'<button id=aa-sel style="flex:1;padding:8px;border:none;border-radius:6px;cursor:pointer;background:#9b59b6;color:#fff;font-weight:600;font-size:12px">🎯 答选中</button>'+
'</div>'+
'<button id=aa-stop style="width:100%;padding:8px;margin:2px 0;border:none;border-radius:6px;cursor:pointer;background:#e74c3c;color:#fff;font-weight:600;font-size:12px;display:none">⏹ 停止</button>'+
'<div style="display:flex;gap:3px;margin-top:4px">'+
'<button id=aa-clear style="flex:1;padding:3px;border:1px solid #e74c3c;border-radius:4px;cursor:pointer;background:transparent;color:#e74c3c;font-size:10px">清除</button>'+
'<button id=aa-reset style="flex:1;padding:3px;border:1px solid #f39c12;border-radius:4px;cursor:pointer;background:transparent;color:#f39c12;font-size:10px">重置</button>'+
'<button id=aa-dsel style="flex:1;padding:3px;border:1px solid #9b59b6;border-radius:4px;cursor:pointer;background:transparent;color:#9b59b6;font-size:10px">取消选中</button>'+
'<button id=aa-hide style="flex:1;padding:3px;border:1px solid #555;border-radius:4px;cursor:pointer;background:transparent;color:#888;font-size:10px">折叠</button>'+
'</div><div id=aa-body><div id=aa-log style="margin-top:6px;padding:6px;background:#16213e;border-radius:6px;font-size:10px;line-height:1.5;max-height:220px;overflow:auto"></div></div></div>');

// ===== 拖拽/关闭/折叠 =====
var panel=document.getElementById('aa');
var isDrag=false,sX,sY,sL,sT;
panel.onmousedown=function(e){if(e.target.closest('button,a,select,#aa-log'))return;isDrag=true;sX=e.clientX;sY=e.clientY;sL=panel.offsetLeft;sT=panel.offsetTop;e.preventDefault();};
document.onmousemove=function(e){if(!isDrag)return;panel.style.left=(sL+e.clientX-sX)+'px';panel.style.top=(sT+e.clientY-sY)+'px';panel.style.right='auto';};
document.onmouseup=function(){isDrag=false;};
document.getElementById('aa-close').onclick=function(){panel.remove();};
var collapsed=false;
document.getElementById('aa-hide').onclick=function(){collapsed=!collapsed;document.getElementById('aa-body').style.display=collapsed?'none':'block';this.textContent=collapsed?'展开':'折叠';};

// ===== 变量 =====
var logEl=document.getElementById('aa-log');
function log(m,c){if(!logEl) return;var d=document.createElement('div');d.style.color=c||'#aaa';d.textContent=m;logEl.appendChild(d);logEl.scrollTop=logEl.scrollHeight;}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
var KEY='YOUR_DEEPSEEK_API_KEY',API='https://api.deepseek.com/v1/chat/completions';
var running=false,stopped=false,pageNum=1,selectedSet=new Set();

// ===== localStorage =====
var LSKEY='aa_done';
function loadDone(){try{var d=JSON.parse(localStorage.getItem(LSKEY)||'[]');return new Set(Array.isArray(d)?d:[]);}catch(e){return new Set();}}
function saveDone(){localStorage.setItem(LSKEY,JSON.stringify([...doneSet]));}
var doneSet=loadDone();

function getQid(rg){
  var box=rg.closest('[id^="question-"],.item-box');
  if(box&&box.id) return box.id;
  return 'q_'+rg.textContent.replace(/\s/g,'').substring(0,50);
}
function isDone(rg){
  if(doneSet.has(getQid(rg))) return true;
  if(rg.querySelector('.el-radio.is-checked,.el-checkbox.is-checked')) return true;
  if(rg.querySelector('input:checked')) return true;
  return false;
}
function getBox(rg){return rg.closest('[id^="question-"],.item-box')||rg.parentElement;}

function scanAll(){
  var groups=document.querySelectorAll('.el-radio-group,.el-checkbox-group');
  var total=groups.length,answered=0,unanswered=[];
  groups.forEach(function(rg){
    if(isDone(rg)){answered++;return;}
    unanswered.push(rg);
  });
  return {total:total,answered:answered,unanswered:unanswered.length,groups:unanswered};
}

function extractOne(rg){
  var qBox=getBox(rg);
  var qInfo=qBox.querySelector('.qusetion-info')||qBox;
  var qText=qInfo.textContent.replace(/\s+/g,' ').trim();
  var items=rg.querySelectorAll('.el-radio,.el-checkbox');
  var opts=[];
  items.forEach(function(item,i){
    var input=item.querySelector('input');
    var lbl=item.querySelector('.el-radio__label,.el-checkbox__label')||item;
    var txt=lbl.textContent.replace(/\s+/g,' ').trim();
    if(txt) qText=qText.split(txt).join('');
    opts.push({index:i,text:txt||('选项'+(i+1)),input:input,el:item});
  });
  qText=qText.replace(/\s+/g,' ').trim().replace(/^\d+[\.\、]\s*/,'').replace(/^(单选|多选|判断)题?\s*(\(.+?\))?\s*/,'').replace(/标记本题\s*/,'');
  if(!qText||opts.length<2) return null;
  var isCB=rg.classList.contains('el-checkbox-group')||!!rg.querySelector('input[type="checkbox"]');
  var qtype=isCB?'multiChoice':'singleChoice';
  if(!isCB&&opts.length===2){
    if(/[对错正确错误truefalse是否√×]/.test(qText+' '+opts.map(function(o){return o.text;}).join(' '))) qtype='trueFalse';
  }
  return {qid:getQid(rg),text:qText,type:qtype,options:opts,box:qBox,rg:rg};
}

function findNextBtn(){
  var btn=document.querySelector('.el-pagination .btn-next:not(.disabled)');
  if(btn&&btn.offsetParent) return btn;
  btn=document.querySelector('.el-pager li:last-child:not(.active):not(.disabled)');
  if(btn&&btn.offsetParent) return btn;
  var all=document.querySelectorAll('button,.el-button,[role="button"],span');
  for(var i=0;i<all.length;i++){if(/^下一[题页步]|^next|^继续|›|»/.test(all[i].textContent.trim())&&all[i].offsetParent) return all[i];}
  return null;
}

async function fillAnswer(q,indices){
  if(q.type==='multiChoice'){
    var opts=q.options;
    for(var i=0;i<opts.length;i++){
      var o=opts[i];
      var chk=o.el.classList.contains('is-checked')||(o.input&&o.input.checked);
      if(chk){
        o.el.click();
        if(o.input){o.input.checked=false;o.input.dispatchEvent(new Event('change',{bubbles:true}));}
        await sleep(50);
      }
    }
    await sleep(100);
    for(var i=0;i<indices.length;i++){
      var idx=indices[i],o=opts[idx];
      if(!o) continue;
      o.el.click();
      if(o.input){o.input.checked=true;o.input.dispatchEvent(new Event('change',{bubbles:true}));}
      await sleep(100);
    }
    await sleep(50);
    var actual=[];
    for(var i=0;i<opts.length;i++){
      if(opts[i].el.classList.contains('is-checked')||(opts[i].input&&opts[i].input.checked)) actual.push(i);
    }
    if(actual.length<indices.length){
      for(var i=0;i<indices.length;i++){
        var o=opts[indices[i]];if(!o) continue;
        var chk=o.el.classList.contains('is-checked')||(o.input&&o.input.checked);
        if(!chk){o.el.click();if(o.input)o.input.checked=true;await sleep(100);}
      }
    }
  }else{
    indices.forEach(function(idx){
      var o=q.options[idx];if(!o) return;
      if(o.input){o.input.checked=true;o.input.dispatchEvent(new Event('change',{bubbles:true}));}
      o.el.click();
    });
  }
}

async function askAI(q){
  var labels='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var optsText=q.options.map(function(o,j){return labels[j]+'. '+o.text;}).join('\n');
  var sys,usr;
  if(q.type==='multiChoice'){
    sys='你是多选题专家。逐项判断每个选项是否正确。返回所有正确选项的字母，放在数组中。即使只有一个正确也返回数组。只返回JSON。';
    usr='多选题。请逐一判断每个选项，选出【所有】正确的选项，不要遗漏任何一个。\n\n题目：'+q.text+'\n\n选项：\n'+optsText+'\n\n请仔细分析每个选项，将【全部】正确选项的字母放入数组。返回JSON格式：\n{"answers":["A","C","D"],"count":3,"reason":"逐项分析"}';
  }else{
    sys='精确答题助手。只返回JSON。';
    usr='单选题：\n题目：'+q.text+'\n选项：\n'+optsText+'\n返回JSON：{"answer":"A","reason":"解释"}';
  }
  var resp=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+KEY},body:JSON.stringify({model:'deepseek-chat',messages:[{role:'system',content:sys},{role:'user',content:usr}],temperature:0.1,max_tokens:800})});
  if(!resp.ok) throw new Error('HTTP '+resp.status);
  var data=await resp.json();
  var content=data.choices[0].message.content.trim();
  var m=content.match(/\{[\s\S]*\}/);if(!m) throw new Error('非JSON:'+content.substring(0,40));
  var ans=JSON.parse(m[0]);
  if(q.type==='multiChoice'){
    var got=ans.answers||ans.answer||'';
    var gotCount=Array.isArray(got)?got.length:(typeof got==='string'&&got.includes(','))?got.split(',').length:1;
    if(gotCount<=1&&q.options.length>=4){
      log('⚠ 仅得'+gotCount+'个答案，重试中...','#f39c12');
      var usr2='上一轮你可能遗漏了正确答案。这是多选题，有【多个】正确答案。\n\n题目：'+q.text+'\n\n选项：\n'+optsText+'\n\n请重新仔细分析【每一个选项】，不要遗漏。选中所有正确的。返回：\n{"answers":["A","B","D"],"count":3,"reason":"逐项分析"}';
      var resp2=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+KEY},body:JSON.stringify({model:'deepseek-chat',messages:[{role:'system',content:'你是多选题专家。此题目有多个正确答案。请选出全部。'},{role:'user',content:usr2}],temperature:0.3,max_tokens:800})});
      if(resp2.ok){
        var data2=await resp2.json();
        var content2=data2.choices[0].message.content.trim();
        var m2=content2.match(/\{[\s\S]*\}/);
        if(m2){try{var ans2=JSON.parse(m2[0]);if(ans2.answers&&Array.isArray(ans2.answers)&&ans2.answers.length>1) ans=ans2;}catch(e){}}
      }
    }
  }
  return ans;
}

function parseAnswer(ans,q){
  var labels='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var indices=[];
  if(q.type==='multiChoice'){
    var raw=ans.answers||ans.answer||'A';
    if(Array.isArray(raw)) raw.forEach(function(a){var ix=labels.indexOf(String(a).trim().toUpperCase());if(ix>=0&&ix<q.options.length)indices.push(ix);});
    else if(typeof raw==='string'&&raw.includes(',')) raw.split(',').forEach(function(a){var ix=labels.indexOf(a.trim().toUpperCase());if(ix>=0)indices.push(ix);});
    else if(typeof raw==='string'&&raw.length>1) raw.split('').forEach(function(a){var ix=labels.indexOf(a.toUpperCase());if(ix>=0)indices.push(ix);});
    else{var ix=labels.indexOf(String(raw).toUpperCase());if(ix>=0)indices.push(ix);}
    indices=indices.filter(function(v,i,a){return a.indexOf(v)===i;});
  }else{
    var ix=labels.indexOf(String(ans.answer||'A').toUpperCase());if(ix>=0&&ix<q.options.length)indices.push(ix);
  }
  return indices;
}

async function answerOne(rg){
  var q=extractOne(rg);
  if(!q||doneSet.has(q.qid)||isDone(rg)) return null;
  q.box.classList.add('aa-ans');
  try{
    var ans=await askAI(q);
    var indices=parseAnswer(ans,q);
    if(q.type==='multiChoice'&&indices.length<=1){
      log('⚠ 多选仅解析出'+indices.length+'个答案: '+JSON.stringify(ans).substring(0,80),'#f39c12');
    }
    if(indices.length===0){q.box.classList.remove('aa-ans');q.box.classList.add('aa-err');return false;}
    await fillAnswer(q,indices);
    doneSet.add(q.qid);saveDone();
    selectedSet.delete(q.qid);q.box.classList.remove('aa-sel','aa-ans');
    q.box.classList.add('aa-ok');
    return {ok:true,type:q.type,reason:ans.reason||'',indices:indices};
  }catch(e){q.box.classList.remove('aa-ans');q.box.classList.add('aa-err');throw e;}
}

async function answerBatch(groups){
  var ok=0,err=0;
  for(var i=0;i<groups.length;i++){
    if(stopped) break;
    if(isDone(groups[i])) continue;
    var q=extractOne(groups[i]);
    if(!q||doneSet.has(q.qid)) continue;
    try{
      var r=await answerOne(groups[i]);
      if(r&&r.ok){var tag=q.type==='multiChoice'?'[多选x'+(r.indices?r.indices.length:'?')+']':'['+(q.type==='trueFalse'?'判断':'单选')+']';ok++;log('#'+(ok+err)+' '+tag+' ✓ '+(r.reason||'').substring(0,50),'#2ecc71');}
      else{err++;log('#'+(ok+err)+' ✗ 未匹配','#e74c3c');}
    }catch(e){err++;log('#'+(ok+err)+' ✗ '+e.message,'#e74c3c');}
    updateStats();
    if(i<groups.length-1) await sleep(350+Math.random()*300);
  }
}

function updateStats(){
  var s=scanAll();
  var el=document.getElementById('aa-stats');
  if(!el) return;
  el.innerHTML='共<strong>'+s.total+'</strong>题 | 已答<strong>'+s.answered+'</strong> | 未答<strong>'+s.unanswered+'</strong> | 选中<strong>'+selectedSet.size+'</strong>';
}

async function answerAll(){
  running=true;stopped=false;pageNum=1;
  document.getElementById('aa-go').style.display='none';document.getElementById('aa-stop').style.display='block';
  while(running&&!stopped){
    updateStats();if(stopped) break;
    var scan=scanAll(),retries=0;
    while(scan.unanswered===0&&retries<30){
      var next=findNextBtn();if(!next) break;
      next.click();await sleep(2000);pageNum++;retries++;
      for(var w=0;w<12&&!stopped;w++){scan=scanAll();if(scan.total>0)break;await sleep(300);}
    }
    if(scan.unanswered===0){log('🏁 全部完成','#2ecc71');break;}
    log('📄 第'+pageNum+'页 未答'+scan.unanswered+'题','#3498db');
    await answerBatch(scan.groups);
  }
  running=false;document.getElementById('aa-go').style.display='block';document.getElementById('aa-stop').style.display='none';updateStats();
}

async function answerSelected(){
  if(selectedSet.size===0){log('没选中题。点击题目区域选中（避开选项按钮）。','#f39c12');return;}
  running=true;stopped=false;
  document.getElementById('aa-sel').style.display='none';document.getElementById('aa-go').style.display='none';document.getElementById('aa-stop').style.display='block';
  var targets=[];
  document.querySelectorAll('.el-radio-group,.el-checkbox-group').forEach(function(rg){
    var qid=getQid(rg);
    if(selectedSet.has(qid)&&!doneSet.has(qid)&&!isDone(rg)) targets.push(rg);
  });
  log('🎯 选中'+selectedSet.size+'，可答'+targets.length,'#9b59b6');
  await answerBatch(targets);
  running=false;document.getElementById('aa-sel').style.display='block';document.getElementById('aa-go').style.display='block';document.getElementById('aa-stop').style.display='none';updateStats();
}

function bindClickSelect(){
  document.querySelectorAll('.item-box,[id^="question-"]').forEach(function(box){
    if(box._aaBound) return;box._aaBound=true;
    box.classList.add('aa-qbox');
    box.addEventListener('click',function(e){
      if(running) return;
      var rg=box.querySelector('.el-radio-group,.el-checkbox-group');
      if(!rg) return;
      if(isDone(rg)) return;
      if(e.target.closest('.el-radio,.el-checkbox,label,input,button')) return;
      var qid=getQid(rg);
      if(selectedSet.has(qid)){selectedSet.delete(qid);box.classList.remove('aa-sel');}
      else{selectedSet.add(qid);box.classList.add('aa-sel');}
      updateStats();
    });
  });
}

bindClickSelect();
setInterval(bindClickSelect,3000);

document.getElementById('aa-go').onclick=function(){answerAll().catch(function(e){log('💥 '+e.message,'#e74c3c');running=false;});};
document.getElementById('aa-sel').onclick=function(){answerSelected().catch(function(e){log('💥 '+e.message,'#e74c3c');running=false;});};
document.getElementById('aa-stop').onclick=function(){stopped=true;running=false;log('⏹ 已停止','#f39c12');updateStats();};
document.getElementById('aa-clear').onclick=function(){
  document.querySelectorAll('.el-radio.is-checked,.el-checkbox.is-checked').forEach(function(r){r.classList.remove('is-checked');});
  document.querySelectorAll('.el-radio-group input:checked,.el-checkbox-group input:checked').forEach(function(i){i.checked=false;i.dispatchEvent(new Event('change',{bubbles:true}));});
  document.querySelectorAll('.aa-sel,.aa-ans,.aa-ok,.aa-err').forEach(function(el){el.classList.remove('aa-sel','aa-ans','aa-ok','aa-err');});
  selectedSet.clear();setTimeout(updateStats,500);
  log('已清除','#f39c12');
};
document.getElementById('aa-reset').onclick=function(){
  doneSet.clear();saveDone();selectedSet.clear();
  document.querySelectorAll('.aa-sel,.aa-ans,.aa-ok,.aa-err').forEach(function(el){el.classList.remove('aa-sel','aa-ans','aa-ok','aa-err');});
  setTimeout(updateStats,500);
  log('已重置所有记录','#e74c3c');
};
document.getElementById('aa-dsel').onclick=function(){
  document.querySelectorAll('.aa-sel').forEach(function(el){el.classList.remove('aa-sel');});
  selectedSet.clear();updateStats();
};

// ===== 监听 SPA 导航 =====
var _obs=new MutationObserver(function(){
  if(!running) bindClickSelect();
  updateStats();
});
_obs.observe(document.body,{childList:true,subtree:true});

document.querySelectorAll('.aa-sel').forEach(function(el){el.classList.remove('aa-sel');});
updateStats();
log('✅ 就绪 | 点题目空白处选中 | 自动注入','#2ecc71');

}

setTimeout(boot, 500);
var obs = new MutationObserver(function() { setTimeout(boot, 500); });
if (document.body) { obs.observe(document.body, { childList: true, subtree: true }); }
else { var bc = setInterval(function() { if (document.body) { clearInterval(bc); obs.observe(document.body, { childList: true, subtree: true }); boot(); } }, 100); }

})();
