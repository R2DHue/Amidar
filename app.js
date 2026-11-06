/* Browser display, input and audio glue. */
'use strict';
(()=>{
  const $=id=>document.getElementById(id),canvas=$('lcd'),ctx=canvas.getContext('2d',{alpha:false});
  ctx.imageSmoothingEnabled=false;
  const pixels=new Uint8Array(96*64),image=ctx.createImageData(96,64);
  const audio=new AmidarAudio();
  let savedHigh=1000;try{savedHigh=Math.max(1000,Number(localStorage.getItem('amidar335.high'))||0);}catch(e){}
  let transition=null,paused=false,gameOver=false,toastTimer;
  const game=new AmidarGame(AMIDAR_DATA,(event,g)=>{
    audio.play(event);
    if(event==='high'){try{localStorage.setItem('amidar335.high',String(g.high));}catch(e){}}
    if(['start','death','level'].includes(event)){
      transition={pixels:pixels.slice(),start:performance.now(),duration:event==='level'?650:420};
    }
    if(event==='gameover'){gameOver=true;showToast('Game over · Jump to try again');}
    if(event==='level')showToast('Level '+g.level+' · Grid cleared');
    if(event==='death'&&g.lives>0)showToast(g.lives+' lives left · Jumps restored');
  },savedHigh);
  function showToast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600);}
  function setPixel(x,y){if(x>=0&&x<96&&y>=0&&y<64)pixels[y*96+x]=1;}
  function byte(x,y,value,clip=false){
    for(let b=0;b<8;b++)if(value&(128>>b)){
      const px=x+b;if(!clip||(px>=8&&px<88&&y>=8))setPixel(px,y);
    }
  }
  function glyph(n,x,y){const a=AMIDAR_DATA.font[n]||AMIDAR_DATA.font[11];for(let i=0;i<8;i++)byte(x,y+i,a[i]);}
  function chars(a,x,y){a.forEach((n,i)=>glyph(n,x+i*8,y));}
  function digits(n,count){return String(n).padStart(count,'0').slice(-count).split('').map(Number);}
  function border(){for(let y=0;y<64;y++){byte(0,y,0x24);byte(88,y,0x24);}}
  function title(){
    chars([17,18,12,19],8+24,2);chars([12,13,14,15,12,16],8+16,11);
    chars([20,14,21,20],8+24,28);
    chars(digits(game.high,6),8+16,37);
    chars([17,22,16,0,8,5,0,23],8+8,56);
  }
  function sprite(n,x,y,top){
    const a=AMIDAR_DATA.sprites[n],sx=x-4+8,sy=y-top+8-3;
    for(let row=0;row<8;row++)byte(sx,sy+row,a[row],true);
  }
  function gameplay(){
    const top=Math.max(0,Math.min(136,game.player.y-28));
    // BGRDSTile: the original 10x24 tiles, scrolling through a 56px viewport.
    for(let i=0;i<240;i++){
      const b=game.board[i],x=8+(i%10)*8,y=Math.floor(i/10)*8-top+8;
      if(y>63||y+7<8)continue;
      const rows=new Uint8Array(8);
      if(b&2)for(let r=0;r<4;r++)rows[r]=8;
      if(b&1)for(let r=3;r<8;r++)rows[r]=8;
      if(b&4)rows[3]=248;
      if(b&8)rows[3]|=15;
      if(b&64){rows[2]|=28;rows[3]|=28;rows[4]|=28;}
      if(b&16){rows[0]=68;rows[2]=17;rows[4]=68;rows[6]=17;}
      for(let r=0;r<8;r++)if(y+r>=8)byte(x,y+r,rows[r],true);
    }
    sprite(game.player.graphic,game.player.x,game.player.y,top);
    if(game.bonus)sprite(4,game.bonus.x,game.bonus.y,top);
    const lift=game.jump?Math.min(game.jump,24-game.jump):0;
    for(const e of game.enemies)sprite(5,e.x,e.y-lift,top);
    chars([...digits(game.score,5),11,10,game.jumps,11,game.lives],8,0);
  }
  function render(now=performance.now()){
    pixels.fill(0);border();
    if(transition){
      const progress=(now-transition.start)/transition.duration;
      if(progress<1){
        const edge=Math.floor(progress*80)+8;
        for(let y=0;y<64;y++)for(let x=Math.max(8,edge);x<88;x++)pixels[y*96+x]=transition.pixels[y*96+x];
      }else transition=null;
    }
    if(!transition){if(game.mode==='title')title();else gameplay();}
    for(let i=0;i<pixels.length;i++){
      const a=pixels[i]?[37,55,43]:[168,179,150],p=i*4;
      image.data[p]=a[0];image.data[p+1]=a[1];image.data[p+2]=a[2];image.data[p+3]=255;
    }
    ctx.putImageData(image,0,0);
    const status=game.mode==='title'?(gameOver?'Game over · Jump or Start to play again':'Tap Jump or Start to play'):
      (paused?'Paused · Tap Pause to resume':`Level ${game.level} · ${game.boxes.filter(b=>b.done).length} / 22 boxes · High ${String(game.high).padStart(5,'0')}`);
    if($('status').textContent!==status)$('status').textContent=status;
    const j=game.mode==='title'?'3 available':`${game.jumps} available`;
    if($('jumpCount').textContent!==j)$('jumpCount').textContent=j;
    const s=game.mode==='title'?'Start':'New game';if($('start').textContent!==s)$('start').textContent=s;
  }
  function resize(){
    const r=$('stage').getBoundingClientRect();
    let availableW=r.width-20;
    if(innerHeight<540&&innerWidth>innerHeight)availableW-=235;
    const scale=Math.max(1,Math.floor(Math.min(availableW/96,(r.height-18)/64)));
    canvas.style.width=(96*scale)+'px';canvas.style.height=(64*scale)+'px';
  }
  new ResizeObserver(resize).observe($('stage'));window.addEventListener('resize',resize);
  let touchDirection=null,padDirection=null,stickPointer=null,touchJump=false,padJump=false;
  let skipJump=false,lastJump=false,lastPadStart=false,lastPadPause=false,lastAnyPad=false;
  const keys=new Map();let keySequence=0;
  const keyMap={ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};
  function direction4(x,y,old,deadzone){
    if(Math.max(Math.abs(x),Math.abs(y))<deadzone)return null;
    const horizontal=old==='left'||old==='right';
    let axis;
    if(old){axis=horizontal?(Math.abs(y)>Math.abs(x)*1.15?'y':'x'):(Math.abs(x)>Math.abs(y)*1.15?'x':'y');}
    else axis=Math.abs(x)>=Math.abs(y)?'x':'y';
    return axis==='x'?(x>=0?'right':'left'):(y>=0?'down':'up');
  }
  function activeDirection(){
    if(touchDirection)return touchDirection;
    let recent=-1,dir=null;
    for(const [code,n]of keys)if(keyMap[code]&&n>recent){recent=n;dir=keyMap[code];}
    return dir||padDirection;
  }
  function jumpHeld(){return touchJump||padJump||keys.has('Space')||keys.has('KeyX');}
  function start(){audio.unlock();paused=false;gameOver=false;skipJump=true;lastJump=true;game.start();$('pause').textContent='Pause';}
  function togglePause(){
    if(game.mode==='title')return;paused=!paused;$('pause').textContent=paused?'Resume':'Pause';
    if(!paused)audio.unlock();
  }
  $('start').addEventListener('click',start);
  $('pause').addEventListener('click',()=>{audio.unlock();togglePause();});
  $('sound').addEventListener('click',()=>{
    audio.enabled=!audio.enabled;$('sound').textContent=audio.enabled?'Sound on':'Sound off';
    $('sound').setAttribute('aria-pressed',String(audio.enabled));if(audio.enabled)audio.unlock();
    if(audio.master)audio.master.gain.value=audio.enabled?.38:0;
  });
  $('helpOpen').addEventListener('click',()=>{audio.unlock();$('help').hidden=false;if(game.mode==='playing'&&!paused)togglePause();$('helpClose').focus();});
  $('helpClose').addEventListener('click',()=>{$('help').hidden=true;$('helpOpen').focus();});
  document.addEventListener('pointerdown',()=>audio.unlock(),{passive:true});
  $('jump').addEventListener('pointerdown',e=>{
    e.preventDefault();$('jump').setPointerCapture(e.pointerId);touchJump=true;$('jump').classList.add('active');
    if(game.mode==='title')start();
  });
  function releaseJump(){touchJump=false;$('jump').classList.remove('active');}
  for(const name of ['pointerup','pointercancel','lostpointercapture'])$('jump').addEventListener(name,releaseJump);
  function moveStick(e){
    if(e.pointerId!==stickPointer)return;
    const r=$('stick').getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/(r.width/2),y=(e.clientY-r.top-r.height/2)/(r.height/2);
    touchDirection=direction4(x,y,touchDirection,.18);
    const v={left:[-27,0],right:[27,0],up:[0,-27],down:[0,27]}[touchDirection]||[0,0];
    $('knob').style.transform=`translate(${v[0]}px,${v[1]}px)`;
    e.preventDefault();
  }
  $('stick').addEventListener('pointerdown',e=>{
    if(stickPointer!==null)return;stickPointer=e.pointerId;$('stick').setPointerCapture(e.pointerId);moveStick(e);
  });
  $('stick').addEventListener('pointermove',moveStick);
  function releaseStick(e){if(e&&e.pointerId!==stickPointer)return;stickPointer=null;touchDirection=null;$('knob').style.transform='';}
  for(const name of ['pointerup','pointercancel','lostpointercapture'])$('stick').addEventListener(name,releaseStick);
  window.addEventListener('keydown',e=>{
    if(!($('help').hidden)){if(e.code==='Escape')$('helpClose').click();return;}
    if(keyMap[e.code]||['Space','KeyX','Enter','KeyP','Escape'].includes(e.code)){
      e.preventDefault();audio.unlock();if(!keys.has(e.code))keys.set(e.code,++keySequence);
      if(!e.repeat){
        if(game.mode==='title'&&['Space','KeyX','Enter'].includes(e.code))start();
        else if(e.code==='KeyP')togglePause();
        else if(e.code==='Escape'){game.mode='title';transition=null;paused=false;$('pause').textContent='Pause';}
      }
    }
  });
  window.addEventListener('keyup',e=>{keys.delete(e.code);if(keyMap[e.code]||['Space','KeyX'].includes(e.code))e.preventDefault();});
  function clearInputs(){keys.clear();releaseStick();releaseJump();padDirection=null;padJump=false;}
  window.addEventListener('blur',()=>{clearInputs();if(game.mode==='playing'&&!paused)togglePause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs();if(game.mode==='playing'&&!paused)togglePause();}});
  const connected=new Set();
  window.addEventListener('gamepadconnected',e=>{connected.add(e.gamepad.index);showToast('Controller connected · A / B to jump');});
  window.addEventListener('gamepaddisconnected',e=>{connected.delete(e.gamepad.index);padDirection=null;padJump=false;showToast('Controller disconnected · Touch controls ready');});
  function pollGamepad(){
    let pads=[];try{pads=navigator.getGamepads?Array.from(navigator.getGamepads()):[];}catch(e){}
    const p=pads.find(p=>p&&p.connected!==false);
    if(!p){padDirection=null;padJump=false;lastPadStart=false;lastPadPause=false;lastAnyPad=false;return;}
    if(!connected.has(p.index)){connected.add(p.index);showToast('Controller connected · A / B to jump');}
    const b=i=>!!(p.buttons[i]&&(p.buttons[i].pressed||p.buttons[i].value>.5));
    const anyButton=p.buttons.some(v=>v&&(v.pressed||v.value>.5));
    if(anyButton&&!lastAnyPad)audio.unlock();lastAnyPad=anyButton;
    const dpx=Number(b(15))-Number(b(14)),dpy=Number(b(13))-Number(b(12));
    if(dpx||dpy)padDirection=direction4(dpx,dpy,padDirection,.1);
    else padDirection=direction4(p.axes[0]||0,p.axes[1]||0,padDirection,.4);
    const prev=padJump;padJump=b(0)||b(1);
    const menu=b(9),view=b(8);
    if((padJump&&!prev)||(menu&&!lastPadStart)||(view&&!lastPadPause))audio.unlock();
    if($('help').hidden){
      if(game.mode==='title'&&((padJump&&!prev)||(menu&&!lastPadStart)))start();
      else if((view&&!lastPadPause)||(menu&&!lastPadStart))togglePause();
    }
    lastPadStart=menu;lastPadPause=view;
  }
  let previous=performance.now(),accumulator=0;
  function frame(now){
    pollGamepad();
    const held=jumpHeld();
    if(!held){skipJump=false;lastJump=false;}
    if(game.mode==='title'&&held&&!lastJump&&$('help').hidden)start();
    lastJump=held;
    const delta=Math.min(100,now-previous);previous=now;
    if(!paused&&!transition&&$('help').hidden&&game.mode==='playing'){
      accumulator+=delta;
      while(accumulator>=1000/30){
        game.tick(activeDirection(),held&&!skipJump);accumulator-=1000/30;
        if(transition||game.mode!=='playing'){accumulator=0;break;}
      }
    }else accumulator=0;
    render(now);requestAnimationFrame(frame);
  }
  // Deterministic test surface exists only with ?test=1; never used for normal play.
  if(new URLSearchParams(location.search).has('test')){
    window.amidarTest={game,render,resize,direction4,pollGamepad,snapshot:()=>game.snapshot(),
      input:()=>({direction:activeDirection(),jump:jumpHeld(),padDirection,touchDirection}),
      clearTransition:()=>{transition=null;},setPaused:v=>{paused=v;},audio,
      step:(direction,jump=false)=>{game.tick(direction,jump);render();}};
  }
  resize();render();requestAnimationFrame(frame);
})();
