import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyStartupProfile,shouldShowReleaseNews,RELEASE_NEWS_KEY,DISMISSED_FOREVER,tomorrowStart,runReleaseStartup,getReleaseNewsOptions} from './releaseNews.js';

test('fresh install stays new after a crash has created main; old empty workspaces are existing',()=>{
  assert.equal(classifyStartupProfile(null,null,null),'new');
  assert.equal(classifyStartupProfile(null,{todos:[]},null),'existing');
  assert.equal(classifyStartupProfile(null,null,[]),'existing');
  assert.equal(classifyStartupProfile('new',{todos:[]},null),'new');
  assert.equal(classifyStartupProfile('existing',null,null),'existing');
});
test('retired notice hides (including 5.6.0) do not suppress the current notice; expiry and permanent dismissal remain independent',()=>{
  const values=new Map([['update-notice:v5.1.2:hidden-until',DISMISSED_FOREVER],['update-notice:v5.5.0:toolkit:hidden-until',DISMISSED_FOREVER],['update-notice:v5.6.0:hidden-until',DISMISSED_FOREVER]]);
  assert.equal(RELEASE_NEWS_KEY,'update-notice:v5.6.2:hidden-until');
  assert.equal(shouldShowReleaseNews(values.get(RELEASE_NEWS_KEY),100),true);
  assert.equal(shouldShowReleaseNews(101,100),false);
  assert.equal(shouldShowReleaseNews(100,100),true);
  assert.equal(shouldShowReleaseNews(DISMISSED_FOREVER,100),false);
  const next=new Date(tomorrowStart(new Date(2026,8,30,23,59)));
  assert.equal(next.getMonth(),9);assert.equal(next.getDate(),1);assert.equal(next.getHours(),0);
});
test('setup must close before tools or the single latest notice, while existing users skip setup',async()=>{
  /** @type {string[]} */ const events=[];
  /** @type {()=>void} */ let finish=()=>{};
  const actions={setup:async()=>{events.push('setup');await new Promise(resolve=>{finish=()=>resolve(undefined);});},launch:async()=>{events.push('tools');},news:async()=>{events.push('news');}};
  const running=runReleaseStartup(true,actions);
  assert.deepEqual(events,['setup']); finish(); await running;
  assert.deepEqual(events,['setup','tools','news']);
  events.length=0;await runReleaseStartup(false,actions);assert.deepEqual(events,['tools','news']);
});
test('unknown setup window failure cannot open another notice on top',async()=>{
  let launches=0;
  await assert.rejects(runReleaseStartup(true,{setup:async()=>{throw Error('window');},launch:async()=>{launches++;},news:async()=>{launches++;}}));
  assert.equal(launches,0);
});
test('release window fits low resolution monitors at 100 to 200 percent scaling',()=>{
  const preferred = getReleaseNewsOptions();
  for(const scale of [1,1.25,1.5,2]){
    const o=getReleaseNewsOptions({size:{width:1366,height:728}},scale);
    assert.ok(o.width*scale<1366);assert.ok(o.height*scale<728);assert.ok(o.minWidth<=o.width);assert.ok(o.minHeight<=o.height);
    if(o.width>o.minWidth) assert.ok(Math.abs(o.width/o.height-preferred.width/preferred.height)<0.002);
  }
  assert.deepEqual(getReleaseNewsOptions({size:{width:3840,height:2040}},1.5),preferred);
});
