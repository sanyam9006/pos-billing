// Dedicated demo-data script: runs seed with force enabled for staging/demo environments
process.env.FORCE_SEED = 'true';
require('./seed');
