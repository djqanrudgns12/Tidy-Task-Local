import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLibrary,validateLibrary} from './storage.js';
import {makeList} from './engine.js';
import {normalizeSettings,applySettingsPatch} from '../toolkit/preferences.js';
test('saved lists have unique stable IDs; duplicate display names are allowed',()=>{
  const lib={...emptyLibrary(),lists:[makeList('groups',['같은모둠','같은모둠'])]};
  assert.equal(validateLibrary(lib),lib);
  lib.lists[0].entries[1].id=lib.lists[0].entries[0].id;assert.throws(()=>validateLibrary(lib));
});
test('future and malformed libraries are rejected rather than overwritten',()=>{
  assert.throws(()=>validateLibrary({...emptyLibrary(),schemaVersion:2}));
  assert.throws(()=>validateLibrary({...emptyLibrary(),lists:[makeList('custom',['a'.repeat(41)])]}));
  assert.throws(()=>validateLibrary({...emptyLibrary(),lists:[makeList('custom',[])]}));
});
test('schema 4 adds picker once without changing previous hiding or timer settings',()=>{
  const s=normalizeSettings({schemaVersion:3,toolkit:{visibleToolIds:['roster'],hiddenPlatformIds:['clanner']},preferences:{digital:{tickEnabled:false}}});
  assert.deepEqual(s.toolkit.visibleToolIds,['roster','picker','tournament','focus-bell','dice','clock']);assert.equal(s.preferences.digital.tickEnabled,false);
  const hidden=applySettingsPatch(s,'toolkit',{visibleToolIds:['roster']});assert.deepEqual(normalizeSettings(hidden).toolkit.visibleToolIds,['roster']);
  assert.deepEqual(hidden.toolkit.hiddenPlatformIds,['clanner']);
});
