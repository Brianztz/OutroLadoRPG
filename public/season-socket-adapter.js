/* Bridges native Socket.IO (local Express) to the same isolated table IDs
 * used by the Cloudflare websocket transport. No effect on classic clients.
 */
(function(global){
 'use strict';
 const space=global.OLSeasonSpace, original=global.io;
 if(!space || !space.isSeasonPage() || typeof original!=='function' || original.__olSeasonAware)return;
 function createSeasonSocket(options={}){
   const socket=original(options);
   const nativeEmit=socket.emit.bind(socket);
   const nativeOn=socket.on.bind(socket);
   const nativeOnce=typeof socket.once==='function'?socket.once.bind(socket):null;
   let currentTable=space.normalize(new URL(global.location.href).searchParams.get('mesa'));
   const scoped=table=>space.tableId(table,'temporada');
   const outgoing=data=>{
     if(!data || typeof data!=='object'||Array.isArray(data))return data;
     if(data.mesa)currentTable=space.normalize(data.mesa);
     return {...data,mesa:scoped(data.mesa||currentTable)};
   };
   const incoming=data=>{
     if(!data || typeof data!=='object')return data;
     if(Array.isArray(data))return data.map(incoming);
     const copy={...data};
     if(copy.mesa===scoped(currentTable))copy.mesa=currentTable;
     return copy;
   };
   socket.emit=function(event,data,...rest){
     return nativeEmit(event,outgoing(data),...rest);
   };
   socket.on=function(event,handler){
     return nativeOn(event,typeof handler==='function'?(data,...rest)=>handler(incoming(data),...rest):handler);
   };
   if(nativeOnce)socket.once=function(event,handler){
     return nativeOnce(event,typeof handler==='function'?(data,...rest)=>handler(incoming(data),...rest):handler);
   };
   return socket;
 }
 // Retain Socket.IO static properties for consumers that inspect them.
 Object.assign(createSeasonSocket,original);
 createSeasonSocket.__olSeasonAware=true;
 global.io=createSeasonSocket;
})(window);
