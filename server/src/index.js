'use strict';
const { createApp } = require('./app');
const { createStore } = require('./store');

const store = createStore();
const port = process.env.PORT || 3000;
createApp(store).listen(port, '0.0.0.0', () => {
  console.log(`Mi Semana API escuchando en el puerto ${port} (almacenamiento: ${store.kind})`);
});
