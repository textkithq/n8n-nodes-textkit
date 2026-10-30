// tsc does not copy non-TS files; n8n loads the icons from dist/ next to each
// node and credential (`icon: 'file:textkit.svg'`).
import { cpSync, mkdirSync } from 'node:fs';
for (const dir of ['credentials', 'nodes/TextKit', 'nodes/TextKitTrigger']) {
	mkdirSync(`dist/${dir}`, { recursive: true });
	cpSync(`${dir}/textkit.svg`, `dist/${dir}/textkit.svg`);
}
