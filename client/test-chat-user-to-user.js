import { io } from 'socket.io-client';

const SERVER_URL = 'https://werewolf-server-production-a7e9.up.railway.app';
console.log(`Connecting to ${SERVER_URL} for User-to-User test...`);

const modSocket = io(SERVER_URL);
let roomCode = '';

modSocket.on('connect', () => {
  modSocket.emit('create_room', null, (res) => {
    if (!res.ok) return process.exit(1);
    roomCode = res.code;
    console.log(`[SETUP] Moderator created room: ${roomCode}`);
    
    // Connect User A
    const userASocket = io(SERVER_URL);
    userASocket.on('connect', () => {
      userASocket.emit('join_room', { code: roomCode, name: 'UserA' }, (joinA) => {
        if (!joinA.ok) return process.exit(1);
        console.log(`[SETUP] UserA joined.`);
        
        // Connect User B
        const userBSocket = io(SERVER_URL);
        userBSocket.on('connect', () => {
          userBSocket.emit('join_room', { code: roomCode, name: 'UserB' }, (joinB) => {
            if (!joinB.ok) return process.exit(1);
            console.log(`[SETUP] UserB joined.`);
            
            // User B listens for chats
            userBSocket.on('state_update', (view) => {
              const chats = view.chat || [];
              const lastChat = chats[chats.length - 1];
              
              if (lastChat && lastChat.message === 'Halo User B, ini User A!') {
                console.log('[TEST SUCCESS] User B berhasil menerima pesan dari User A!');
                
                // Now User B replies
                userBSocket.emit('chat_message', { message: 'Halo balik User A!' });
              }
            });

            // User A listens for chats
            userASocket.on('state_update', (view) => {
              const chats = view.chat || [];
              const lastChat = chats[chats.length - 1];
              
              if (lastChat && lastChat.message === 'Halo balik User A!') {
                console.log('[TEST SUCCESS] User A berhasil menerima balasan dari User B!');
                console.log('Semua tes User-ke-User BERHASIL!');
                process.exit(0);
              }
            });

            // Trigger the conversation
            console.log('[ACTION] User A mengirim pesan ke grup...');
            setTimeout(() => {
              userASocket.emit('chat_message', { message: 'Halo User B, ini User A!' });
            }, 1000);
          });
        });
      });
    });
  });
});
