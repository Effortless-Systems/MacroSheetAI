import {mkdir,writeFile} from 'node:fs/promises';
import {templateDefinition} from '../templates/tracker-v2.mjs';
const target=new URL('../plugins/macrosheet/skills/macrosheet/assets/tracker-template.json',import.meta.url);
const definition=templateDefinition();
await mkdir(new URL('.',target),{recursive:true});
await writeFile(target,JSON.stringify(definition,null,2)+'\n');
console.log('Built data-free tracker template '+definition.templateVersion);
