/* JavaScript rules translation of Amidar by Paul Robson (25 May 2001, build 335).
   No CPU, ROM, calculator OS, or instruction interpreter is used. */
'use strict';
class AmidarGame {
  constructor(data, onEvent=()=>{}, high=1000) {
    this.data=data; this.onEvent=onEvent; this.high=high; this.mode='title';
    this.seed=0; this.seed2=0; this.frame=1; this.speedCt=0;
    this.score=0; this.level=1; this.lives=3; this.jumps=3; this.jump=0;
    this.enemies=[]; this.bonus=null; this.player={x:4,y:187,graphic:0};
    this.board=data.board.slice(); this.boxes=data.boxes.map(b=>({...b,done:false}));
  }
  event(type) { this.onEvent(type,this); }
  random() { // HARDWARE.Z80 HWRandom shift/XOR generator and byte counter.
    const s=this.seed;
    const bit=((s>>>15)^(s>>>14)^(s>>>12)^(s>>>3))&1;
    this.seed=((s<<1)|bit)&65535;
    if (!this.seed) this.seed=255;
    this.seed2=(this.seed2+1)&255;
    return (this.seed&255)^this.seed2;
  }
  start() {
    this.score=0; this.level=1; this.lives=3; this.mode='playing';
    this.newLevel(); this.event('start');
  }
  newLevel() {
    this.board=this.data.board.map(b=>(b&~(16|64))|((b&128)?64:0));
    this.boxes=this.data.boxes.map(b=>({...b,done:false}));
    this.player={x:4,y:187,graphic:0}; this.old=[0,0]; this.jump=0;
    this.bonus=null; this.jumps=3;
    // Intended GAME.Z80 progression; repair reversed branch / overrun (see NOTES).
    this.enemyCount=Math.min(8,this.level+3);
    this.speed=Math.min(255,112+32*this.level);
    this.createEnemies(); this.frame=(this.frame+80)&255;
  }
  createEnemies() {
    this.enemies=[];
    for(let i=0;i<this.enemyCount;i++){
      const x=(this.random()&63)+8, dx=(this.random()&2)-1;
      const bottom=this.player.y<96;
      this.enemies.push({x,y:bottom?187:3,dx,dy:0,genY:bottom?-1:1,pattern:i===this.enemyCount-1?1:0});
    }
  }
  index(x,y) { return Math.floor(y/8)*10+Math.floor(x/8); }
  canMove(x,y) {
    if(x<0||x>=80||y<0||y>=192)return false;
    const b=this.board[this.index(x,y)],fx=x&7,fy=y&7;
    return (fx===4&&((fy<=3&&(b&2))||(fy>=3&&(b&1)))) ||
           (fy===3&&((fx<=4&&(b&4))||(fx>=4&&(b&8)))) ? true:false;
  }
  addScore(points) {
    this.score=(this.score+points)%100000;
    if(this.score>this.high){this.high=this.score;this.event('high');}
  }
  collect() {
    const i=this.index(this.player.x,this.player.y);
    if(!(this.board[i]&64))return;
    this.board[i]&=~64; this.addScore(10); this.event('dot');
    let filled=false;
    for(const b of this.boxes){
      if(!b.done && b.edge.every(i=>!(this.board[i]&64))){
        b.done=true; for(const i of b.fill)this.board[i]|=16; filled=true;
      }
    }
    if(filled)this.event('paint');
    if(this.boxes.every(b=>b.done)){
      this.level++; this.newLevel(); this.event('level');
    }
  }
  movePlayer(direction, jumping) {
    if(this.jump){this.jump++;if(this.jump===24)this.jump=0;}
    if(jumping && !this.jump && this.jumps>0){this.jumps--;this.jump=1;this.event('jump');}
    const vectors={up:[0,-1,0],down:[0,1,1],right:[1,0,2],left:[-1,0,3]};
    const v=vectors[direction];
    let d=this.old;
    if(v && this.canMove(this.player.x+v[0],this.player.y+v[1])){
      d=[v[0],v[1]];this.old=d;this.player.graphic=v[2];
    }
    if((d[0]||d[1])&&this.canMove(this.player.x+d[0],this.player.y+d[1])){
      this.player.x+=d[0];this.player.y+=d[1];this.collect();
    }
  }
  near(o) { return Math.abs(o.x-this.player.x)<3 && Math.abs(o.y-this.player.y)<3; }
  collide() {
    if(this.jump||!this.enemies.some(e=>this.near(e)))return false;
    this.lives--;this.jumps=3;this.createEnemies();this.frame=(this.frame+80)&255;
    this.event('death');
    if(this.lives===0){this.mode='title';this.event('gameover');}
    return true;
  }
  moveEnemies() {
    this.speedCt+=this.speed;
    if(this.speedCt<256)return;
    this.speedCt-=256;
    for(const e of this.enemies){
      e.x+=e.dx;e.y+=e.dy;
      if((e.x&7)!==4 || (e.y&7)!==3)continue;
      const i=this.index(e.x,e.y),b=this.board[i]&15;
      if(e.pattern===1){
        if(i===0){e.dx=0;e.dy=1;}
        if(i===230){e.dx=1;e.dy=0;}
        if(i===239){e.dx=0;e.dy=-1;}
        if(i===9){e.dx=-1;e.dy=0;}
      }else if(b!==3&&b!==12){
        // ENEMY.Z80 _EMO0 compares dY to edge positions: read it as Y.
        const vertical=e.dx!==0 || (e.y!==3&&e.y!==187&&!(this.random()&1));
        if(vertical){
          if(e.y===3)e.genY=1;
          if(e.y===187)e.genY=-1;
          e.dx=0;e.dy=e.genY;
        }else{
          e.dy=0;
          e.dx=(this.random()&4)?1:-1;
          if(e.dx===1&&!(b&8))e.dx=-1;
          if(e.dx===-1&&!(b&4))e.dx=1;
        }
      }
    }
  }
  checkBonus() {
    if(!this.bonus&&this.frame===255&&!(this.random()&3)){
      for(let n=0;n<2048;n++){
        const x=(this.random()&120)|4,y=(this.random()&248)|3;
        if(this.canMove(x,y)){this.bonus={x,y};break;}
      }
    }
    if(this.bonus&&this.near(this.bonus)){
      this.bonus=null;this.addScore(500);this.event('bonus');
    }
  }
  tick(direction=null,jumping=false) {
    if(this.mode!=='playing')return;
    // GAME.Z80 order: collide, player, collide, enemies, bonus, draw.
    if(this.collide())return;
    this.movePlayer(direction,jumping);
    if(this.collide())return;
    this.moveEnemies();this.checkBonus();this.frame=(this.frame+1)&255;
  }
  snapshot() {
    return {mode:this.mode,score:this.score,high:this.high,level:this.level,lives:this.lives,
      jumps:this.jumps,jump:this.jump,player:{...this.player},enemies:this.enemies.map(e=>({...e})),
      remainingDots:this.board.filter(b=>b&64).length,filledBoxes:this.boxes.filter(b=>b.done).length,
      speed:this.speed,frame:this.frame,bonus:this.bonus&&{...this.bonus}};
  }
}
if(typeof module!=='undefined')module.exports=AmidarGame;
