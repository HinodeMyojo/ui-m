// Песочница для артефактов хаба — docs/hub-module.md (back-m).
//
// Артефакт — самодостаточный HTML со своими скриптами, который собрал Claude.
// Пройденное он помнит сам, в localStorage. Запускать его как есть нельзя
// по двум причинам:
//   1. на нашем происхождении его скрипт увидел бы токен входа;
//   2. в iframe без allow-same-origin у него пустое происхождение, и обращение
//      к localStorage бросает SecurityError — тренажёр бы ничего не запомнил.
// Поэтому iframe живёт в песочнице, а localStorage подменяется хранилищем в
// памяти, которое заранее наполнено сохранённым состоянием и о каждой записи
// сообщает родителю. Родитель отправляет состояние на сервер — и прогресс
// живёт на любом устройстве, а не в одном браузере.

export const HUB_SANDBOX = "allow-scripts allow-forms allow-modals allow-popups allow-downloads";

// Строка JSON внутри <script>: «</script>» и разделители строк JS ломают разбор.
function inlineJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function shimScript(channel, state) {
  return `<script>(function(){
var CH=${inlineJson(channel)};
var data=${inlineJson(state || {})};
var timer=null;
function flush(){try{parent.postMessage({hubArtifact:CH,type:"state",data:data},"*")}catch(e){}}
function later(){clearTimeout(timer);timer=setTimeout(flush,400)}
function storage(map,persist){
  var api={
    getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(map,k)?map[k]:null},
    setItem:function(k,v){map[String(k)]=String(v);if(persist)later()},
    removeItem:function(k){delete map[String(k)];if(persist)later()},
    clear:function(){for(var k in map)delete map[k];if(persist)later()},
    key:function(i){var ks=Object.keys(map);return i<ks.length?ks[i]:null}
  };
  Object.defineProperty(api,"length",{get:function(){return Object.keys(map).length}});
  if(typeof Proxy!=="function")return api;
  return new Proxy(api,{
    get:function(t,p){if(p in t)return t[p];return typeof p==="string"&&Object.prototype.hasOwnProperty.call(map,p)?map[p]:undefined},
    set:function(t,p,v){if(p in t)return true;map[String(p)]=String(v);if(persist)later();return true},
    deleteProperty:function(t,p){delete map[String(p)];if(persist)later();return true},
    has:function(t,p){return p in t||Object.prototype.hasOwnProperty.call(map,p)},
    ownKeys:function(){return Object.keys(map)},
    getOwnPropertyDescriptor:function(t,p){if(Object.prototype.hasOwnProperty.call(map,p))return{value:map[p],enumerable:true,configurable:true,writable:true}}
  });
}
var local=storage(data,true),session=storage({},false);
try{Object.defineProperty(window,"localStorage",{value:local,configurable:true})}catch(e){}
try{Object.defineProperty(window,"sessionStorage",{value:session,configurable:true})}catch(e){}
addEventListener("pagehide",flush);
addEventListener("message",function(e){if(e.data&&e.data.hubArtifact===CH&&e.data.type==="flush")flush()});
})();<\/script>`;
}

// buildArtifactDoc вставляет подмену первым скриптом документа: тренажёр
// читает состояние при загрузке, и подмена обязана успеть раньше. Вставляем
// после <head>, а не перед <!doctype>: иначе страница уйдёт в режим quirks.
export function buildArtifactDoc(html, channel, state) {
  const shim = shimScript(channel, state);
  const head = html.match(/<head(\s[^>]*)?>/i);
  if (head) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + shim + html.slice(at);
  }
  const root = html.match(/<html(\s[^>]*)?>/i);
  if (root) {
    const at = root.index + root[0].length;
    return html.slice(0, at) + "<head>" + shim + "</head>" + html.slice(at);
  }
  return shim + html;
}
