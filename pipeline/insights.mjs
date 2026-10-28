import {spawnSync} from 'node:child_process';
const result=spawnSync('python3',['pipeline/insights.py',...process.argv.slice(2)],{stdio:'inherit'});if(result.error)throw result.error;process.exit(result.status??1);
