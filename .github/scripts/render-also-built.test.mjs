import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { projects, render, validate, refresh } from './render-also-built.mjs';
const root=new URL('../../',import.meta.url);
const meta=JSON.parse(await readFile(new URL('profile/also-built/metadata.json',root),'utf8'));
test('valid snapshot',()=>validate(meta));
test('refresh uses public repo star counts',async()=>{let i=0;const names=['jsonMartin/readwise-mirror','jsonMartin/AstroNot'];const x=await refresh(async()=>({ok:true,json:async()=>({private:false,full_name:names[i++],stargazers_count:123})}));assert.equal(x.repositories[names[0]].stars,123);assert.equal(x.repositories[names[1]].stars,123);});
test('refresh rejects private repo',async()=>{await assert.rejects(()=>refresh(async()=>({ok:true,json:async()=>({private:true,full_name:'jsonMartin/readwise-mirror',stargazers_count:1})})));});

test('visible cards omit refresh boilerplate and AstroNot icon cluster',()=>{
  const readwise=render(projects[0],70);
  const astronot=render(projects[1],60);
  assert.doesNotMatch(readwise,/stars refreshed daily/);
  assert.doesNotMatch(astronot,/stars refreshed daily/);
  assert.match(readwise,/fill="#8b5cf6"/);
  assert.match(astronot,/<text x="20" y="34"[^>]*>AstroNot<\/text>/);
  assert.doesNotMatch(astronot,/translate\(17 19\)|translate\(31 3\)/);
});
