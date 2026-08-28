import fs from 'fs';

let content = fs.readFileSync('client/src/App.jsx', 'utf8');

const replacements = {
  // Lobby
  '"Malam<br/>Serigala"': '"Werewolf"',
  'Malam Serigala': 'Werewolf',
  'Experience the ultimate game of deception, trust, and betrayal. Will you survive the night?': 'Game fitnah-fitnahan paling sus se-RT. Yakin lo bisa survive sampai pagi?',
  'Buat Room Baru': 'Gas Bikin Room',
  '>Buat Room<': '>Bikin Room<',
  'Jadi Pemandu, atur peran & jalan cerita.': 'Jadi bandar/admin, atur role & plot twist.',
  'Masukkan kode dari Pemandu untuk main.': 'Masukin kode dari admin biar bisa nimbrung.',
  'Kamu akan bertindak sebagai Pemandu (Moderator). Siapkan strategi terbaik untuk pemainmu.': 'Lo bakal jadi admin yang ngatur jalannya game. Siapin mental buat dengerin bacotan player.',
  'Membangkitkan...': 'Bikin room...',
  'Menyusup...': 'Loading...',
  'Gabung Sekarang': 'Join Sekarang',
  'Kode Room (mis. AB12C)': 'Kode Room (contoh: AB12C)',
  'Nama Kamu': 'Nama Lo (yang gaul)',
  '>Batal<': '>Cancel<',
  'Yakin ingin keluar dari room ini?': 'Yakin mau cabut dari room ini?',
  'Keluar': 'Cabut',
  'BUAT ROOM': 'BIKIN ROOM',

  // Setup
  'Susun Peran': 'Atur Role',
  'Komposisi Peran': 'Susunan Role',
  'Total peran': 'Total role',
  'Menunggu pemain join': 'Nunggu bocah-bocah join',
  'Siap! ${totalRoles} peran untuk ${players.length} pemain.': 'Mantul! ${totalRoles} role buat ${players.length} player.',
  'Total peran (${totalRoles}) belum sama dengan jumlah pemain (${players.length}).': 'Total role (${totalRoles}) belum klop sama jumlah player (${players.length}).',
  'Tambahkan pemain manual (opsional)': 'Add player manual (kalo ada yang gaptek)',
  'Tambahkan': 'Add',
  'Pemain (': 'Player (',
  'Belum ada yang join. Bagikan kode room di atas.': 'Masih sepi cuy. Share kode room ke circle lo.',
  'Acak &amp; Bagi Peran': 'Gacha Role &amp; Gas!',
  'Menunggu Pemandu': 'Nunggu Admin',
  'Pemandu sedang menyiapkan komposisi peran. Kamu sudah masuk daftar pemain di bawah.': 'Admin lagi nyiapin role. Nama lo udah masuk list di bawah yak.',
  'Nama pemain, satu per baris\\n(buat yang belum sempat join sendiri)': 'Nama player, satu per baris\\n(buat yang gaptek join sendiri)',

  // Reveal
  'Menunggu Pemain Siap': 'Nunggu Player Ready',
  'sudah lihat peran': 'udah ngintip role',
  'Setiap pemain melihat perannya sendiri di HP masing-masing.': 'Tiap player cek role di HP masing-masing ya, awas ngintip!',
  'Mulai Malam Pertama': 'Gas Malam Pertama',
  'Peranmu': 'Role Lo',
  'Ketuk untuk lihat peranmu': 'Tap buat liat role lo',
  'Kamu sudah siap. Menunggu pemain lain & Pemandu memulai malam...': '✓ Lo udah ready. Sabar nunggu yang lain kelar...',
  '> Siap<': '> Ready<',
  'Pembagian Peran': 'Bagi Role',

  // Actions
  'Pilih 2 pemain untuk dijodohkan (sehidup semati)': 'Pilih 2 player buat di-ship (sehidup semati)',
  'Jodohkan &amp; Lanjut': 'Ship &amp; Lanjut',
  'Hasil ramalan': 'Hasil kepoan',
  'Sembunyikan &amp; Lanjut': 'Hide &amp; Lanjut',
  'Pilih pemain untuk diperiksa': 'Pilih player yang mau lo kepoin rolenya',
  'Hasil ramalan cuma butuh role asli — server sudah tahu, tapi label akan muncul setelah kamu memilih.': 'Hasil terawangan bakal dimunculin begitu lo pilih targetnya.',
  'Pilih pemain untuk dilindungi malam ini': 'Pilih player yang mau lo beking malam ini',
  'Lewati (jangan lindungi siapa pun)': 'Skip (biarin aja dah)',
  'Alpha baru gugur — pilih 2 target untuk gigitan ganda': 'Alpha tewas — pilih 2 mangsa buat double kill',
  'Pilih 1 target untuk diserang': 'Pilih 1 mangsa buat di-kill',
  'Serang &amp; Lanjut': 'Kill &amp; Lanjut',
  'Werewolf menyerang:': 'Werewolf nge-kill:',
  'Werewolf tidak menyerang siapa pun malam ini': 'Werewolf lagi puasa nge-kill malam ini',
  'Ramuan Penolong (sisa 1x)': 'Potion Heal (sisa 1x)',
  'Ramuan Racun (sisa 1x, opsional)': 'Potion Racun (sisa 1x, opsional)',
  'Konfirmasi &amp; Lanjut': 'Confirm &amp; Lanjut',

  // Resolution
  'Gugur!': 'Wasted!',
  'Menunggu Hunter memutuskan siapa yang ditembak sebelum wafat...': 'Nunggu Hunter nembak orang sebelum mokad...',
  'Sebagai Hunter, boleh langsung menembak mati 1 pemain lain sebelum wafat.': 'Sebagai Hunter, lo berhak bawa 1 orang buat mokad bareng.',
  'Lewati (tidak menembak)': 'Skip (gajadi nembak)',

  // Moderator Log
  'Rahasia — jangan buka kalau pemain lain sedang melihat layar ini.': 'Top Secret — jangan buka kalo ada yang ngintip layar lo.',
  'Sembunyikan': 'Hide',
  'Lihat': 'Intip',
  'Catatan Moderator': 'Bocoran Admin',

  // Phase
  'hidup': 'survive',

  // Morning
  'Pagi Hari — setelah': 'Pagi Cuy — abis',
  'Malam berlalu dengan damai. Tidak ada yang tewas.': 'Malam yang chill. Gada yang mokad semalam.',
  'Lanjut ke Diskusi': 'Gas Bacot (Diskusi)',

  // Discussion
  '>Mulai<': '>Start<',
  'Jeda': 'Pause',
  'Mulai Voting': 'Gas Voting',

  // Voting
  'sudah vote': 'udah nge-vote',
  'Vote-mu': 'Pilihan Lo',
  '>Vote<': '>Vote<',
  'Hasil seri:': 'Seri cuy:',
  'Tidak ada yang dieliminasi': 'Skip (gada yang di-kick)',
  'Selesai Voting': 'Bungkus Voting',

  // Game Over
  'berhasil digantung dan menang sendirian.': 'berhasil nge-troll warga dan menang sendirian.',
  'TIM WARGA MENANG! Semua Werewolf berhasil dilenyapkan.': 'WARGA WIN! Semua Werewolf berhasil di-wipe out.',
  'TIM WEREWOLF MENANG! Jumlah Werewolf menyamai warga yang tersisa.': 'WEREWOLF WIN! GGWP, warga udah abis dibantai.',
  'Main Lagi (pemain sama)': 'Rematch (circle yang sama)',
  'Reset Total': 'Reset All',

  // Header
  'Kamu Pemandu': 'Lo Admin',
  'Werewolf online': 'Werewolf no delay',
};

for (const [key, val] of Object.entries(replacements)) {
  content = content.replaceAll(key, val);
}

fs.writeFileSync('client/src/App.jsx', content);
console.log('App.jsx successfully translated to Gen Z slang!');
