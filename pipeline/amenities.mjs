import{spawnSync}from'node:child_process';const r=spawnSync('python3',['pipeline/amenities.py'],{stdio:'inherit'});if(r.error)throw r.error;process.exit(r.status??1);
