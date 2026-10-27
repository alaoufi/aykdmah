import{u as O,j as e,z as ie,J as se,a as oe,K as le,M as Q,N as ce,L as X,G as Z,H as ee,s as te,t as re,O as de,P as ne,Q as pe,R as ue,S as fe,T as xe,U as he,V as me}from"./index-DMo0uPZP.js";import{r as i,j as be,u as ge,L as G}from"./react-vendor-Ct9Yxb50.js";import{i as ye}from"./geolocation-CWTbi4Nb.js";import{C as ve}from"./ConfirmDialog-DFZXhZaI.js";import{g as je}from"./geo-BRnv0Oz-.js";import"./socket-vendor-CNH_rReR.js";function we({message:t}){const{t:n}=O(),d=t.reply_type==="image"?"🖼️ "+(t.reply_content||""):t.reply_type==="voice"?"🎙️ "+n("chat.voice_message"):t.reply_type==="location"?"📍 "+n("chat.shared_location"):t.reply_type==="file"?"📄 "+(t.reply_content||""):t.reply_content||"";return e.jsxs("div",{className:"reply-preview",children:[e.jsx("div",{className:"reply-name",children:t.reply_sender_name||"—"}),e.jsx("div",{className:"reply-body",children:d||n("chat.message_deleted")})]})}function ke({lat:t,lng:n}){const{t:d}=O(),o=`https://www.google.com/maps/dir/?api=1&destination=${t},${n}&travelmode=driving`,u=`https://staticmap.openstreetmap.de/staticmap.php?center=${t},${n}&zoom=15&size=320x180&markers=${t},${n},red-pushpin`;return e.jsxs("a",{href:o,target:"_blank",rel:"noopener noreferrer",className:"location-card no-underline",children:[e.jsxs("div",{className:"map-thumb",children:[e.jsx("img",{src:u,alt:d("chat.shared_location"),onError:N=>{N.currentTarget.style.display="none"}}),e.jsx("span",{className:"map-pin",children:"📍"})]}),e.jsxs("div",{className:"location-meta",children:[e.jsx("div",{className:"location-title",children:d("chat.shared_location")}),e.jsxs("div",{className:"location-coords",children:[Number(t).toFixed(5),", ",Number(n).toFixed(5)]}),e.jsxs("div",{className:"location-open",children:["🧭 ",d("chat.open_in_maps")]})]})]})}function _e({message:t,isMine:n,onReply:d,onDelete:o}){const{t:u}=O(),[N,w]=i.useState(!1),R=Array.isArray(t.files)&&t.files.length>0,v=t.message_type==="location"&&t.latitude!=null&&t.longitude!=null&&ye(Number(t.latitude),Number(t.longitude));return t.message_type==="system"?e.jsx("div",{className:"text-center my-3",children:e.jsx("span",{className:"inline-block px-3 py-1 rounded-pill bg-slate-100 text-slate-500 text-[11px]",children:t.content})}):e.jsxs("div",{className:`bubble-row ${n?"mine":"theirs"}`,onDoubleClick:()=>w(!0),children:[e.jsxs("div",{className:`bubble ${n?"mine":"theirs"} ${v?"has-location":""}`,children:[t.reply_to_id&&t.reply_content!==void 0&&e.jsx(we,{message:t}),v&&e.jsx(ke,{lat:Number(t.latitude),lng:Number(t.longitude)}),t.content&&!v&&e.jsx("div",{className:"content",children:t.content}),t.content&&v&&e.jsx("div",{className:"content content-after-location",children:t.content}),R&&e.jsx("div",{className:"files",children:t.files.map(f=>{const x=ie(f.file_url);if(!x)return null;const L=(f.file_type||"").startsWith("image/"),b=(f.file_type||"").startsWith("audio/");return L?e.jsx("a",{href:x,target:"_blank",rel:"noopener noreferrer",children:e.jsx("img",{src:x,alt:f.file_name,loading:"lazy"})},f.id):b?e.jsx("audio",{controls:!0,src:x,className:"voice-player"},f.id):e.jsxs("a",{href:x,target:"_blank",rel:"noopener noreferrer",className:"file-link",children:["📄 ",f.file_name||u("chat.attachment")]},f.id)})}),e.jsxs("div",{className:"meta",children:[e.jsx("span",{children:se(t.created_at)}),n&&e.jsx("span",{className:"read-ticks",children:t.is_read?" ✓✓":" ✓"})]}),e.jsx("button",{className:"msg-action",onClick:()=>w(f=>!f),"aria-label":"more",children:"⋯"}),N&&e.jsxs("div",{className:"menu",onMouseLeave:()=>w(!1),children:[d&&e.jsxs("button",{onClick:()=>{w(!1),d(t)},children:["↩ ",u("chat.reply")]}),n&&o&&e.jsxs("button",{className:"danger",onClick:()=>{w(!1),o(t)},children:["🗑 ",u("admin.delete")]})]})]}),e.jsx("style",{children:`
        .bubble-row { display: flex; margin: 6px 0; }
        .bubble-row.mine { justify-content: flex-end; }
        .bubble-row.theirs { justify-content: flex-start; }
        .bubble {
          position: relative;
          max-width: 78%; padding: 8px 12px; border-radius: 14px;
          word-wrap: break-word; overflow-wrap: anywhere;
          box-shadow: 0 1px 1px rgba(0,0,0,.06);
        }
        .bubble.mine {
          background: linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)));
          color: #fff; border-bottom-end-radius: 4px;
        }
        .bubble.theirs { background: #ffffff; color: #0f172a; border-bottom-start-radius: 4px; border: 1px solid rgba(15,23,42,.08); }
        .bubble.has-location { padding: 6px; }
        .content { white-space: pre-wrap; line-height: 1.45; font-size: 14px; padding-bottom: 2px; }
        .content-after-location { padding: 8px 8px 2px 8px; }
        .files { margin-top: 6px; display: flex; flex-direction: column; gap: 6px; }
        .files img { max-width: 240px; max-height: 280px; border-radius: 10px; display: block; }
        .voice-player { width: 220px; }
        .file-link { color: inherit; text-decoration: underline; opacity: .9; font-size: 13px; }
        .meta {
          font-size: 10.5px; opacity: .7; margin-top: 4px; text-align: end;
          display: flex; gap: 4px; justify-content: flex-end; align-items: center;
        }
        .read-ticks { letter-spacing: -1px; font-weight: 700; }
        .bubble.mine .read-ticks { color: #f0fdfa; }
        .reply-preview {
          background: rgba(255,255,255,.18); border-inline-start: 3px solid rgba(255,255,255,.55);
          padding: 6px 10px; border-radius: 8px; margin-bottom: 6px; font-size: 12.5px;
        }
        .bubble.theirs .reply-preview {
          background: rgb(var(--color-primary) / .08); border-inline-start-color: rgb(var(--color-primary));
        }
        .reply-name { font-weight: 700; opacity: .9; margin-bottom: 2px; }
        .reply-body { opacity: .85; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .location-card {
          display: block; color: inherit; border-radius: 10px; overflow: hidden;
          background: rgba(0,0,0,.05); margin-bottom: 4px;
        }
        .bubble.theirs .location-card { background: #f1f5f9; }
        .map-thumb { position: relative; height: 140px; background: #cbd5e1; }
        .map-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .map-pin { position: absolute; inset: 0; display: grid; place-items: center; font-size: 32px; text-shadow: 0 2px 4px rgba(0,0,0,.4); }
        .location-meta { padding: 8px 10px; }
        .location-title { font-weight: 700; font-size: 13px; }
        .location-coords { font-size: 11px; opacity: .75; margin-top: 1px; font-family: ui-monospace, monospace; }
        .location-open { font-size: 12px; opacity: .9; margin-top: 4px; font-weight: 600; }
        .msg-action {
          position: absolute; top: 4px; inset-inline-end: 4px;
          width: 22px; height: 22px; border-radius: 50%; border: 0;
          background: transparent; color: inherit; opacity: 0;
          cursor: pointer; font-size: 14px; line-height: 1;
          transition: opacity .15s;
        }
        .bubble:hover .msg-action { opacity: .7; }
        .msg-action:hover { background: rgba(0,0,0,.15); opacity: 1; }
        .menu {
          position: absolute; top: 28px; inset-inline-end: 4px;
          background: #fff; color: #0f172a; border: 1px solid #e2e8f0;
          border-radius: 10px; box-shadow: 0 6px 18px rgba(15,23,42,.12);
          padding: 4px; min-width: 130px; z-index: 10;
          display: flex; flex-direction: column;
        }
        .menu button {
          background: transparent; border: 0; padding: 7px 10px;
          text-align: start; cursor: pointer; font-size: 13px; border-radius: 6px;
        }
        .menu button:hover { background: #f1f5f9; }
        .menu button.danger { color: #dc2626; }
      `})]})}const Ne=["😀","😂","😍","👍","🙏","🔥","✅","❤️","👏","💯","🎉","😎"];function Re({onSend:t,onShareLocation:n,sharingLocation:d,disabled:o}){const{t:u}=O(),[N,w]=i.useState(""),[R,v]=i.useState([]),[A,f]=i.useState(!1),[x,L]=i.useState(!1),[b,U]=i.useState(!1),[z,W]=i.useState(!1),I=i.useRef(null),k=i.useRef(null),j=i.useRef(null),E=i.useRef([]),T=i.useRef(null),_=i.useRef(!1),$=i.useRef(!1),P=i.useRef(!1),D=i.useRef(null);i.useEffect(()=>(_.current=!0,()=>{_.current=!1,clearTimeout(D.current),j.current?.state==="recording"&&j.current.stop(),T.current?.getTracks().forEach(a=>a.stop())}),[]);const M=async()=>{if(o||$.current||x||P.current)return;const a=N.trim();if(!(!a&&R.length===0)){$.current=!0,U(!0);try{if(await t({content:a,files:R})===!1||!_.current)return;w(""),v([]),f(!1),I.current?.focus()}catch{}finally{$.current=!1,_.current&&U(!1)}}},F=a=>{a.key==="Enter"&&!a.shiftKey&&!a.nativeEvent.isComposing&&(a.preventDefault(),M())},g=a=>{if(!a||!a.length)return;const c=Array.from(a).slice(0,4);v(m=>[...m,...c].slice(0,4))},J=a=>{v(c=>c.filter((m,q)=>q!==a))},V=async()=>{if(o||$.current||P.current||j.current?.state==="recording")return;P.current=!0,W(!0);let a;try{if(a=await navigator.mediaDevices.getUserMedia({audio:!0}),!_.current){a.getTracks().forEach(m=>m.stop());return}T.current=a;const c=new MediaRecorder(a);E.current=[],c.ondataavailable=m=>{m.data.size>0&&E.current.push(m.data)},c.onstop=()=>{clearTimeout(D.current);const m=c.mimeType||"audio/webm",q=new Blob(E.current,{type:m}),B=m.includes("mp4")?"m4a":m.includes("ogg")?"ogg":"webm",Y=new File([q],`voice-${Date.now()}.${B}`,{type:m});_.current&&(v([Y]),L(!1)),a.getTracks().forEach(C=>C.stop()),T.current=null},c.start(),j.current=c,L(!0),D.current=setTimeout(()=>{c.state==="recording"&&c.stop()},6e4)}catch{a?.getTracks().forEach(m=>m.stop()),_.current&&alert(u("errors.browser_unsupported"))}finally{P.current=!1,_.current&&W(!1)}},K=()=>{j.current&&j.current.state==="recording"&&j.current.stop(),L(!1)};return e.jsxs("div",{className:"chat-input",children:[R.length>0&&e.jsx("div",{className:"attachments",children:R.map((a,c)=>e.jsxs("div",{className:"attachment",children:[e.jsxs("span",{children:[a.type?.startsWith("image/")?"🖼️":a.type?.startsWith("audio/")?"🎙️":"📄"," ",a.name]}),e.jsx("button",{onClick:()=>J(c),disabled:b,"aria-label":u("common.delete"),children:"✕"})]},c))}),A&&e.jsx("div",{className:"emoji-row",children:Ne.map(a=>e.jsx("button",{disabled:b,onClick:()=>{w(c=>c+a),I.current?.focus()},children:a},a))}),e.jsxs("div",{className:"input-row",children:[e.jsx("button",{type:"button",onClick:()=>k.current?.click(),"aria-label":u("request.attachments"),disabled:o||b||x||z,children:"📎"}),e.jsx("button",{type:"button",onClick:()=>f(a=>!a),"aria-label":"emoji",disabled:o||b,children:"😀"}),n&&e.jsx("button",{type:"button",onClick:n,disabled:o||b||d,"aria-label":u("chat.share_location"),className:d?"recording":"",title:u("chat.share_location"),children:"📍"}),x?e.jsx("button",{type:"button",onClick:K,"aria-label":u("common.close"),className:"recording",children:"⏹"}):e.jsx("button",{type:"button",onClick:V,"aria-label":"voice",disabled:o||b||z,children:"🎙️"}),e.jsx("input",{ref:I,type:"text",value:N,onChange:a=>w(a.target.value),onKeyDown:F,placeholder:u("chat.placeholder"),disabled:o||b}),e.jsx("button",{className:"send-btn",onClick:M,disabled:o||b||x||z||!N.trim()&&R.length===0,"aria-label":u("common.send"),children:"➤"}),e.jsx("input",{ref:k,type:"file",multiple:!0,hidden:!0,accept:"image/*,application/pdf",onChange:a=>g(a.target.files)})]}),e.jsx("style",{children:`
        .chat-input { border-top: 1px solid var(--border); background: var(--bg-card); padding: 8px; }
        .input-row { display: flex; align-items: center; gap: 6px; }
        .input-row input {
          flex: 1; padding: 10px 14px; border: 1px solid var(--border);
          border-radius: 999px; background: var(--bg-soft); font: inherit;
        }
        .input-row input:focus { outline: none; border-color: var(--primary); background: var(--bg-card); }
        .input-row button {
          background: transparent; border: 0; cursor: pointer; padding: 8px;
          font-size: 18px; border-radius: 50%; transition: var(--transition);
          width: 38px; height: 38px; display: grid; place-items: center; color: var(--text-secondary);
        }
        .input-row button:hover:not(:disabled) { background: var(--bg-soft); }
        .input-row .send-btn {
          background: var(--primary); color: #fff;
        }
        .input-row .send-btn:hover:not(:disabled) { background: var(--primary-dark); }
        .input-row .send-btn:disabled { opacity: .4; cursor: not-allowed; }
        .recording { background: rgba(239, 68, 68, .14) !important; color: var(--danger) !important; animation: pulse 1.2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .6; } }
        .attachments { display: flex; gap: 6px; flex-wrap: wrap; padding: 6px 8px; }
        .attachment {
          background: var(--bg-soft); border-radius: 999px; padding: 4px 10px;
          display: inline-flex; gap: 6px; align-items: center; font-size: 12px;
        }
        .attachment button { background: transparent; border: 0; cursor: pointer; }
        .emoji-row {
          padding: 6px; display: flex; flex-wrap: wrap; gap: 4px;
          border-bottom: 1px solid var(--border);
        }
        .emoji-row button {
          background: transparent; border: 0; font-size: 22px; cursor: pointer;
          padding: 4px 6px; border-radius: 6px;
        }
        .emoji-row button:hover { background: var(--bg-soft); }
      `})]})}function Me(){const{t}=O(),{id:n}=be(),{user:d}=oe(),{socket:o,realtimeMode:u}=le(),N=ge(),[w,R]=i.useState([]),[v,A]=i.useState(null),[f,x]=i.useState([]),[L,b]=i.useState(!0),[U,z]=i.useState(!1),[W,I]=i.useState(null),[k,j]=i.useState(null),[E,T]=i.useState(null),[_,$]=i.useState(!1),P=i.useRef(null),D=i.useRef(null),M=i.useRef(null),F=i.useRef(null),g=i.useRef(null);g.current=`${d?.id}:${n||""}`;const[J,V]=i.useState(!1),[K,a]=i.useState(!1),c=i.useCallback(()=>D.current?.refresh(),[]);i.useEffect(()=>{if(R([]),b(!0),V(!1),!d?.id){b(!1);return}const r=Q(xe,{intervalMs:u==="polling"?1e4:null,onResult:l=>{R(l||[]),b(!1),V(!1)},onError:()=>{b(!1),V(!0)}});return D.current=r,()=>{r.stop(),D.current=null}},[d?.id,u]),i.useEffect(()=>{if(A(null),x([]),j(null),T(null),$(!1),I(null),a(!1),!n||!d?.id){z(!1);return}z(!0);let r=!1;const l=Q(()=>Promise.all([he(n),me(n,{limit:80})]),{intervalMs:u==="polling"?5e3:null,onResult:([s,h])=>{A(s),x(h||[]),z(!1),a(!1),!r&&h?.some(p=>p.sender_id!==d.id&&!p.is_read)&&(r=!0,ne(n).then(c).catch(()=>{}).finally(()=>{r=!1}))},onError:s=>{z(!1),a(!0),[403,404].includes(s?.response?.status)&&N("/chat",{replace:!0})}});return M.current=l,()=>{l.stop(),M.current=null}},[n,d?.id,u,N,c]),i.useEffect(()=>()=>{g.current=null,clearTimeout(F.current)},[]),i.useEffect(()=>{if(!o||!n)return;o.emit("chat:join",Number(n));const r=p=>{Number(p.conversation_id)===Number(n)&&(x(S=>S.some(y=>y.id===p.id)?S:[...S,p]),ne(n).catch(()=>{})),c()},l=p=>{Number(p.conversationId)===Number(n)&&p.userId!==d.id&&(I(p.isTyping?p.userId:null),p.isTyping&&(clearTimeout(F.current),F.current=setTimeout(()=>I(null),2500)))},s=p=>{Number(p.conversationId)===Number(n)&&x(S=>S.filter(y=>y.id!==p.messageId))},h=p=>{Number(p.conversationId)===Number(n)&&p.userId!==d.id&&x(S=>S.map(y=>y.sender_id===d.id&&!y.is_read?{...y,is_read:1}:y))};return o.on("chat:message",r),o.on("chat:typing",l),o.on("chat:deleted",s),o.on("chat:read",h),()=>{clearTimeout(F.current),o.emit("chat:leave",Number(n)),o.off("chat:message",r),o.off("chat:typing",l),o.off("chat:deleted",s),o.off("chat:read",h)}},[o,n,d,c]),i.useEffect(()=>{P.current?.scrollIntoView({behavior:"smooth"})},[f.length,f.at(-1)?.id,W]);const m=async({content:r,files:l})=>{if(!n)return!1;const s=g.current;try{const h=new FormData;r&&h.append("content",r),l.length===1&&l[0].type?.startsWith("audio/")?h.append("message_type","voice"):l.length&&!r&&h.append("message_type","file"),k&&h.append("reply_to_id",String(k.id)),l.forEach(y=>h.append("files",y));const S=await pe(n,h);return g.current!==s?!1:(M.current?.refresh(),x(y=>y.some(ae=>ae.id===S.id)?y:[...y,S]),j(null),c(),!0)}catch{return g.current===s&&alert(t("errors.generic")),!1}},q=async()=>{if(!n||_)return;const r=g.current;$(!0);try{const l=await je();if(g.current!==r)return;const s=await ue(n,{latitude:l.latitude,longitude:l.longitude,accuracy_m:l.accuracy_m,reply_to_id:k?k.id:void 0});if(g.current!==r)return;M.current?.refresh(),x(h=>h.some(p=>p.id===s.id)?h:[...h,s]),j(null),c()}catch{g.current===r&&alert(t("location.geolocation_failed"))}finally{g.current===r&&$(!1)}},B=async()=>{if(!E)return;const r=g.current;try{if(await fe(n,E.id),g.current!==r)return;M.current?.refresh(),x(l=>l.filter(s=>s.id!==E.id))}catch{}g.current===r&&T(null)},Y=i.useMemo(()=>{const r=[];let l=null;for(const s of f)ce(l,s.created_at)||(r.push({__type:"separator",key:`sep-${s.id}`,date:s.created_at}),l=s.created_at),r.push(s);return r},[f]),C=v?.participants?.find(r=>r.id!==d.id),H=v?.request_id;return e.jsxs("div",{className:"chat-page",children:[e.jsxs("aside",{className:`chat-sidebar ${n?"hide-on-mobile":""}`,children:[e.jsxs("div",{className:"sidebar-header",children:[e.jsx("h3",{children:t("chat.title")}),J&&e.jsx("p",{role:"alert",className:"text-xs text-danger",children:t("errors.generic")})]}),L?e.jsx(X,{}):w.length===0?e.jsx(Z,{title:t("chat.no_conversations")}):e.jsx("div",{className:"conv-list",children:w.map(r=>{const l=typeof r.other_user=="string"?JSON.parse(r.other_user):r.other_user,s=typeof r.last_message=="string"?JSON.parse(r.last_message):r.last_message,h=Number(n)===r.id,p=s?s.message_type==="location"?"📍 "+t("chat.shared_location"):s.message_type==="voice"?"🎙️ "+t("chat.voice_message"):s.message_type==="image"?"🖼️ "+(s.content||t("chat.image")):s.content||"📎":t("chat.no_messages");return e.jsxs(G,{to:`/chat/${r.id}`,className:`conv-item ${h?"active":""}`,children:[e.jsx(ee,{src:l?.avatar,name:l?.full_name}),e.jsxs("div",{style:{flex:1,minWidth:0},children:[e.jsxs("div",{className:"flex justify-between",children:[e.jsx("strong",{children:l?.full_name||"—"}),e.jsx("span",{className:"text-xs text-muted",children:s?te(s.created_at):""})]}),e.jsx("div",{className:"text-sm text-muted",style:{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},children:re(p,50)})]}),r.unread_count>0&&e.jsx("span",{className:"badge badge-primary",children:r.unread_count})]},r.id)})})]}),e.jsx("section",{className:`chat-main ${n?"":"hide-on-mobile"}`,children:n?U?e.jsx(X,{}):e.jsxs(e.Fragment,{children:[e.jsxs("header",{className:"chat-header",children:[e.jsx(G,{to:"/chat",className:"back-btn",children:"←"}),C&&e.jsxs(e.Fragment,{children:[e.jsx(ee,{src:C.avatar,name:C.full_name}),e.jsxs("div",{style:{flex:1,minWidth:0},children:[e.jsx("strong",{children:C.full_name}),e.jsx("div",{className:"text-xs text-muted",children:u==="polling"?t("chat.periodic_updates",{defaultValue:"تُحدّث الرسائل كل 5 ثوانٍ"}):C.is_online?"🟢 "+t("chat.online"):C.last_seen_at?`${t("chat.last_seen")} ${te(C.last_seen_at)}`:""})]}),H&&e.jsx(G,{to:`/requests/${H}/track`,className:"track-btn","aria-label":t("tracking.title"),title:t("tracking.title"),children:"🗺️"})]})]}),K&&e.jsx("p",{role:"alert",className:"text-xs text-danger p-2",children:t("errors.generic")}),e.jsxs("div",{className:"chat-body",children:[f.length===0?e.jsx(Z,{title:t("chat.no_messages")}):Y.map(r=>r.__type==="separator"?e.jsx("div",{className:"date-separator",children:e.jsx("span",{children:de(r.date,t)})},r.key):e.jsx(_e,{message:r,isMine:r.sender_id===d.id,onReply:j,onDelete:T},r.id)),W&&e.jsxs("div",{className:"typing-indicator",children:[e.jsx("span",{}),e.jsx("span",{}),e.jsx("span",{})]}),e.jsx("div",{ref:P})]}),k&&e.jsxs("div",{className:"reply-bar",children:[e.jsxs("div",{className:"reply-bar-content",children:[e.jsxs("div",{className:"reply-name",children:["↩ ",k.sender_name]}),e.jsx("div",{className:"reply-text",children:k.message_type==="location"?"📍 "+t("chat.shared_location"):re(k.content||"📎",80)})]}),e.jsx("button",{onClick:()=>j(null),"aria-label":t("common.close"),children:"✕"})]}),e.jsx(Re,{onSend:m,onShareLocation:q,sharingLocation:_,disabled:!v||u==="socket"&&!o},n)]}):e.jsxs("div",{className:"empty-state",style:{flex:1},children:[e.jsx("div",{style:{fontSize:48},children:"💬"}),e.jsx("h3",{children:t("chat.title")}),e.jsx("p",{children:t("chat.no_conversations")})]})}),e.jsx(ve,{open:!!E,title:t("chat.delete_message_title"),body:t("chat.delete_message_body"),confirmLabel:t("admin.delete"),tone:"danger",onConfirm:B,onCancel:()=>T(null)}),e.jsx("style",{children:`
        .chat-page {
          display: grid; grid-template-columns: 320px 1fr;
          height: calc(100vh - var(--header-h)); background: #f1f5f9;
        }
        .chat-sidebar {
          border-inline-end: 1px solid var(--border); background: var(--bg-card);
          display: flex; flex-direction: column; overflow: hidden;
        }
        .sidebar-header { padding: 16px; border-bottom: 1px solid var(--border); }
        .conv-list { overflow-y: auto; flex: 1; }
        .conv-item {
          display: flex; align-items: center; gap: 12px; padding: 14px 16px;
          border-bottom: 1px solid var(--border); cursor: pointer;
          color: inherit; text-decoration: none;
        }
        .conv-item:hover { background: var(--bg-soft); text-decoration: none; }
        .conv-item.active { background: rgba(135,98,57,.08); }
        .chat-main {
          display: flex; flex-direction: column; height: 100%; overflow: hidden;
        }
        .chat-header {
          padding: 10px 16px; background: var(--bg-card);
          border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px;
          box-shadow: 0 1px 3px rgba(15,23,42,.04);
        }
        .back-btn {
          display: none; background: transparent; border: 0; font-size: 20px;
          color: var(--text); text-decoration: none;
        }
        .track-btn {
          width: 38px; height: 38px; border-radius: 50%;
          display: grid; place-items: center;
          background: #ecfdf5; color: #047857; font-size: 18px;
          text-decoration: none; transition: transform .15s;
        }
        .track-btn:hover { transform: scale(1.08); }
        .chat-body {
          flex: 1; overflow-y: auto; padding: 16px;
          background-image: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
        }
        .date-separator {
          text-align: center; margin: 16px 0 8px;
        }
        .date-separator span {
          display: inline-block; background: rgba(255,255,255,.85);
          padding: 4px 12px; border-radius: 999px;
          font-size: 11px; color: #64748b; font-weight: 600;
          box-shadow: 0 1px 2px rgba(15,23,42,.05);
        }
        .typing-indicator {
          display: inline-flex; gap: 4px; padding: 8px 14px;
          background: #fff; border-radius: 14px; margin: 4px 0;
          box-shadow: 0 1px 1px rgba(0,0,0,.06);
        }
        .typing-indicator span {
          width: 6px; height: 6px; border-radius: 50%;
          background: #94a3b8; animation: bounce 1.2s infinite;
        }
        .typing-indicator span:nth-child(2) { animation-delay: .15s; }
        .typing-indicator span:nth-child(3) { animation-delay: .3s; }
        @keyframes bounce {
          0%, 60%, 100% { opacity: .3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
        .reply-bar {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 12px; background: #f1f5f9;
          border-top: 1px solid var(--border);
        }
        .reply-bar-content {
          flex: 1; min-width: 0; padding: 6px 10px;
          border-inline-start: 3px solid #876239;
          background: #fff; border-radius: 8px;
        }
        .reply-bar-content .reply-name { font-size: 12px; font-weight: 700; color: #876239; }
        .reply-bar-content .reply-text { font-size: 12.5px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .reply-bar button { background: transparent; border: 0; font-size: 16px; cursor: pointer; color: #64748b; }
        @media (max-width: 768px) {
          .chat-page { grid-template-columns: 1fr; }
          .chat-sidebar.hide-on-mobile, .chat-main.hide-on-mobile { display: none; }
          .back-btn { display: inline-block; }
        }
      `})]})}export{Me as default};
