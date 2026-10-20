(() => {
  const cfg = window.BURUNGITAW_CONFIG;
  window.Buru = {
    cfg,
    client: window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey),
    uid(prefix="dev") {
      const key = "burungitaw_"+prefix+"_uuid";
      let v = localStorage.getItem(key);
      if (!v) {
        v = (crypto.randomUUID ? crypto.randomUUID() : prefix+"-"+Date.now()+"-"+Math.random().toString(16).slice(2));
        localStorage.setItem(key,v);
      }
      return v;
    },
    async event() {
      const {data,error}=await this.client.from("festival_events").select("*").eq("slug",cfg.eventSlug).single();
      if(error) throw error;
      return data;
    },
    async login(email,password){
      const {data,error}=await this.client.auth.signInWithPassword({email,password});
      if(error) throw error;
      return data;
    },
    async session(){ return (await this.client.auth.getSession()).data.session; },
    async logout(){ return this.client.auth.signOut(); },
    fmt(n,d=2){ return Number(n||0).toFixed(d)+"%"; },
    show(el,msg,type="info"){
      el.textContent=msg; el.dataset.type=type; el.hidden=false;
    }
  };
})();