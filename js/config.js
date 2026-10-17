/* Supabase connection for the boats-for-sale listings.
   Paste the values from Supabase: Project Settings -> API Keys.
   Use the "publishable" key (starts with sb_publishable_). It's meant to be public; the database
   rules in supabase/setup.sql are what stop anyone except you from changing listings.
   Never put a secret key (sb_secret_... or service_role) here. */
window.FRASER_CONFIG = {
  supabaseUrl: '',      // e.g. 'https://abcdefghijklm.supabase.co'
  supabaseAnonKey: '',  // the publishable key, e.g. 'sb_publishable_...'
};
