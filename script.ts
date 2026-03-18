import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

try {
  const output = execSync('git log -p src/components/Views.tsx').toString();
  writeFileSync('git_log.txt', output);
  console.log('Success');
} catch (e) {
  console.error(e);
}
