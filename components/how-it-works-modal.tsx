"use client";
import { useState, useEffect } from "react";

const STEPS = [
  { number: "1", title: "Pick a market", description: "Browse markets on any topic. Pick YES or NO based on what you think will happen. Odds shift in real time as others trade.", visual: "market" },
  { number: "2", title: "Place a trade", description: "Connect your wallet in minutes and get free DESO to start trading right away. Pick YES or NO — if correct, it pays out at resolution.", visual: "trade" },
  { number: "3", title: "Every person has a token", description: "Every public figure on Caldera has a real token. When markets are traded, 1% of every fee automatically buys back that token.", visual: "token" },
  { number: "4", title: "Fees flow back into tokens", description: "Hold any token on Caldera. As markets about that person are traded, fees automatically buy back that token — on every single trade.", visual: "earn" },
];

export function HowItWorksModal() {
  const [show, setShow] = useState(true);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (localStorage.getItem("caldera_hiw_seen")) setShow(false);
  }, []);

  useEffect(() => {
    const handler = () => { setStep(0); setShow(true); };
    window.addEventListener("show-hiw-modal", handler);
    return () => window.removeEventListener("show-hiw-modal", handler);
  }, []);

  const dismiss = () => { localStorage.setItem("caldera_hiw_seen", "1"); setShow(false); };
  const next = () => { if (step < STEPS.length - 1) setStep(s => s + 1); else dismiss(); };

  if (!show) return null;
  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center p-4" style={{backgroundColor:"rgba(0,0,0,0.75)"}} onClick={(e)=>{if(e.target===e.currentTarget)dismiss();}}>
      <div style={{backgroundColor:"#ffffff",borderRadius:"16px",width:"100%",maxWidth:"360px",overflow:"hidden",color:"#111111"}}>
        <div style={{backgroundColor:"#f4f4f5",padding:"32px 24px",display:"flex",alignItems:"center",justifyContent:"center",minHeight:"220px",position:"relative"}}>
          <button onClick={dismiss} style={{position:"absolute",top:"12px",right:"12px",background:"none",border:"none",cursor:"pointer",fontSize:"20px",color:"#888",width:"28px",height:"28px"}}>×</button>
          {current.visual==="market"&&<div style={{backgroundColor:"#fff",borderRadius:"16px",padding:"20px",width:"100%",maxWidth:"260px",border:"1px solid #e4e4e7"}}>
            <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"16px"}}><img src="https://node.deso.org/api/v0/get-single-profile-picture/BC1YLh2JrNMXmkerRRa7UgeqGgvcAbQ96rtfJHkVXkmafNNdfsHZDPZ?fallback=https://i.imgur.com/w1BEqJv.png" style={{width:"40px",height:"40px",borderRadius:"50%",objectFit:"cover"}} alt="Trump"/><div><div style={{fontSize:"13px",fontWeight:600}}>realdonaldtrump</div><div style={{fontSize:"11px",color:"#888"}}>392 holders</div></div></div>
            <div style={{fontSize:"13px",fontWeight:500,marginBottom:"12px",lineHeight:1.4}}>Will Trump sign a new executive order on tariffs before May 1?</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}><span style={{fontSize:"24px",fontWeight:700}}>71%</span><span style={{fontSize:"11px",color:"#888"}}>chance YES</span></div>
            <div style={{display:"flex",gap:"8px"}}><button style={{flex:1,background:"#22c55e",color:"#fff",border:"none",borderRadius:"10px",padding:"8px",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>YES 71¢</button><button style={{flex:1,background:"#f4f4f5",color:"#111",border:"1px solid #e4e4e7",borderRadius:"10px",padding:"8px",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>NO 29¢</button></div>
          </div>}
          {current.visual==="trade"&&<div style={{backgroundColor:"#fff",borderRadius:"16px",padding:"20px",width:"100%",maxWidth:"260px",border:"1px solid #e4e4e7"}}>
            <div style={{fontSize:"11px",color:"#888",marginBottom:"4px"}}>Buying YES</div>
            <div style={{fontSize:"40px",fontWeight:700,marginBottom:"4px"}}>$50</div>
            <div style={{height:"1px",background:"#e4e4e7",margin:"12px 0"}}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:"13px",marginBottom:"6px"}}><span style={{color:"#888"}}>Shares</span><span style={{fontWeight:600}}>74.6</span></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:"13px",marginBottom:"16px"}}><span style={{color:"#888"}}>Pays if correct</span><span style={{fontWeight:600,color:"#22c55e"}}>$74.60</span></div>
            <button style={{width:"100%",background:"#22c55e",color:"#fff",border:"none",borderRadius:"10px",padding:"10px",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>Buy YES</button>
          </div>}
          {current.visual==="token"&&<div style={{backgroundColor:"#fff",borderRadius:"16px",padding:"20px",width:"100%",maxWidth:"260px",border:"1px solid #e4e4e7"}}>
            <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"16px"}}><img src="https://node.deso.org/api/v0/get-single-profile-picture/BC1YLhbhbNctADcV4AZDFk2NtAGWrfPytryAZsZoTA1KGme7EcNZbTH?fallback=https://i.imgur.com/w1BEqJv.png" style={{width:"44px",height:"44px",borderRadius:"50%",objectFit:"cover"}} alt="LeBron"/><div style={{flex:1}}><div style={{fontSize:"13px",fontWeight:600}}>$lebronjames</div><div style={{fontSize:"11px",color:"#888"}}>1,573 holders</div></div><div style={{textAlign:"right"}}><div style={{fontSize:"13px",fontWeight:600}}>$1.46</div><div style={{fontSize:"11px",color:"#22c55e"}}>▲ 3.2%</div></div></div>
            <div style={{backgroundColor:"#f4f4f5",borderRadius:"10px",padding:"12px"}}><div style={{fontSize:"11px",color:"#888",marginBottom:"4px"}}>Latest buyback</div><div style={{fontSize:"13px",fontWeight:600}}>🔄 $0.87 auto-buyback</div><div style={{fontSize:"11px",color:"#888",marginTop:"2px"}}>triggered by a market trade</div></div>
          </div>}
          {current.visual==="earn"&&<div style={{width:"100%",maxWidth:"280px"}}>
            <div style={{backgroundColor:"#fff",borderRadius:"10px",padding:"12px 16px",border:"1px solid #e4e4e7",marginBottom:"8px"}}><div style={{fontSize:"11px",color:"#888",marginBottom:"2px"}}>Someone trades</div><div style={{fontSize:"13px",fontWeight:600}}>$100 on a LeBron market</div></div>
            <div style={{textAlign:"center",color:"#888",margin:"4px 0"}}>↓</div>
            <div style={{backgroundColor:"#fff",borderRadius:"10px",padding:"12px 16px",border:"1px solid #e4e4e7",marginBottom:"8px"}}><div style={{fontSize:"11px",color:"#888",marginBottom:"4px"}}>2% fee splits</div><div style={{fontSize:"13px",fontWeight:600,color:"#22c55e"}}>$1 → buys back $lebronjames</div><div style={{fontSize:"13px",color:"#888"}}>$1 → platform</div></div>
            <div style={{textAlign:"center",color:"#888",margin:"4px 0"}}>↓</div>
            <div style={{backgroundColor:"#f4f4f5",borderRadius:"10px",padding:"12px 16px",border:"1px solid #e4e4e7",textAlign:"center"}}><div style={{fontSize:"12px",fontWeight:600,lineHeight:1.5}}>Token buyback happens automatically on every single trade</div></div>
          </div>}
        </div>
        <div style={{padding:"24px"}}>
          <div style={{fontSize:"11px",color:"#888",fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:"4px"}}>Step {current.number} of {STEPS.length}</div>
          <h2 style={{fontSize:"20px",fontWeight:700,marginBottom:"8px",color:"#111"}}>{current.title}</h2>
          <p style={{fontSize:"14px",color:"#555",lineHeight:1.6,marginBottom:"24px"}}>{current.description}</p>
          <div style={{display:"flex",justifyContent:"center",gap:"6px",marginBottom:"16px"}}>
            {STEPS.map((_,i)=><div key={i} style={{height:"6px",borderRadius:"3px",width:i===step?"24px":"6px",backgroundColor:i===step?"#111":"#ddd",transition:"all 0.2s"}}/>)}
          </div>
          <button onClick={next} style={{width:"100%",backgroundColor:"#f97316",color:"#fff",border:"none",borderRadius:"12px",padding:"14px",fontSize:"14px",fontWeight:600,cursor:"pointer"}}>
            {step<STEPS.length-1?"Next":"Get Started →"}
          </button>
        </div>
      </div>
    </div>
  );
}
