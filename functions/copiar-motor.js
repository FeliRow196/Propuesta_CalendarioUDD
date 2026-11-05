'use strict';
// Copia el motor de reglas (server/src/engine.js) a functions/ antes de publicar la función
const fs = require('fs');
const path = require('path');

fs.copyFileSync(path.join(__dirname, '..', 'server', 'src', 'engine.js'), path.join(__dirname, 'engine.js'));
console.log('Motor de reglas copiado a functions/engine.js');
