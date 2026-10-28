import{spawnSync}from'node:child_process';const r=spawnSync('python3',['pipeline/community.py',...process.argv.slice(2)],{stdio:'inherit'});if(r.error)throw r.error;process.exit(r.status??1);
