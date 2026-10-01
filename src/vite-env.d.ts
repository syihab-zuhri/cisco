/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Alamat server relay kelas (mis. http://192.168.1.5:5174). Kosong = relay satu
   * origin dengan aplikasi (`npm run dev` / `npm run preview`). Dapat ditimpa per
   * perangkat lewat localStorage kunci `openpacket_relay_url`.
   */
  readonly VITE_CLASSROOM_RELAY_URL?: string;
}
