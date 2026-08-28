import { io } from 'socket.io-client';

const SERVER_URL = 'https://werewolf-server-production-a7e9.up.railway.app';
console.log(`Connecting to ${SERVER_URL}...`);

const modSocket = io(SERVER_URL);
let roomCode = '';
let modToken = '';
let playerToken = '';

modSocket.on('connect', () => {
  console.log('Moderator connected.');
  
  modSocket.emit('create_room', null, (res) => {
    if (!res.ok) {
      console.error('Failed to create room:', res.error);
      process.exit(1);
    }
    roomCode = res.code;
    modToken = res.token;
    console.log(`[TEST 1] Room created: ${roomCode}`);
    
    const playerSocket = io(SERVER_URL);
    playerSocket.on('connect', () => {
      console.log('Player connected.');
      playerSocket.emit('join_room', { code: roomCode, name: 'TestPlayer' }, (joinRes) => {
        if (!joinRes.ok) {
          console.error('Failed to join:', joinRes.error);
          process.exit(1);
        }
        playerToken = joinRes.token;
        console.log(`[TEST 2] Player joined as TestPlayer.`);
        
        // Listen for chats
        modSocket.on('state_update', (view) => {
          const chats = view.chat || [];
          const lastChat = chats[chats.length - 1];
          if (lastChat && lastChat.message === 'Hello from TestPlayer!') {
            console.log('[TEST 3] SUCCESS: Chat received by moderator from player!');
            
            // Now Moderator sends a message
            modSocket.emit('chat_message', { message: 'Hello back from Moderator!' });
          }
        });

        playerSocket.on('state_update', (view) => {
          const chats = view.chat || [];
          const lastChat = chats[chats.length - 1];
          if (lastChat && lastChat.message === 'Hello back from Moderator!') {
            console.log('[TEST 4] SUCCESS: Chat received by player from moderator!');
            console.log('All tests passed successfully!');
            process.exit(0);
          }
        });

        setTimeout(() => {
          playerSocket.emit('chat_message', { message: 'Hello from TestPlayer!' });
        }, 1000);
      });
    });
  });
});
