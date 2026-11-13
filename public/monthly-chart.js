import {currencyScale} from './currency.js';
import {uiIcon} from './invoice-design.js';

const green='#098638';
const el=(tag,cls,text)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined)node.textContent=text;
 return node;
};
function svg(tag,attributes){
 const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
 for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);
 return node;
}

export function growthChange(current,previous){
 if(!previous)return {percent:null,difference:current-previous,state:current?'new':'empty'};
 return {percent:(current-previous)/Math.abs(previous)*100,difference:current-previous,state:current>previous?'up':current<previous?'down':'same'};
}

export function groupChartDays(rows,interval,alignToStart=false){
 if(interval==='daily')return rows;
 const groups=new Map();
 for(const [index,row] of rows.entries()){
  let key=row.day.slice(0,7);
  if(alignToStart){
   key=interval==='weekly'?Math.floor(index/7):0;
  }else if(interval==='weekly'){
   const day=new Date(row.day+'T00:00:00Z');
   day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);
   key=day.toISOString().slice(0,10);
  }
  if(!groups.has(key))groups.set(key,{day:row.day,sales:0,profit:0,orders:0});
  const group=groups.get(key);
  for(const metric of ['sales','profit','orders'])group[metric]+=row[metric];
 }
 return [...groups.values()];
}

function curve(points){
 const [first,...rest]=points;
 let path='M'+first.join(' ');
 for(const [index,point] of rest.entries()){
  const previous=points[index];
  const distance=(point[0]-previous[0])*.4;
  path+=` C${previous[0]+distance} ${previous[1]}, ${point[0]-distance} ${point[1]}, ${point[0]} ${point[1]}`;
 }
 return path;
}

export function mountMonthlyChart(host,comparison,{t,money,locale='en-IN',currency='USD'}){
 host.replaceChildren();
 host.classList.add('growth-studio','shopify-chart','overview-chart');
 let mode='history',metric='sales',interval='daily',visible=true,selected=0;
 const title=el('h2',null,t('business_performance'));
 title.prepend(uiIcon('growth'));
 const head=el('div','shop-chart-heading');
 const topControls=el('div','overview-chart-options');
 const toggle=el('button','overview-chart-toggle',t('show_chart'));
 toggle.type='button';
 toggle.setAttribute('role','switch');
 toggle.append(el('span','overview-switch-track'));
 toggle.addEventListener('click',()=>{visible=!visible;updateVisibility();});
 const range=el('div','shop-range-buttons');
 const tabs=el('div','shop-metric-tabs');
 const intervals=el('div','shop-chart-switches');
 const controls=el('div','overview-chart-controls');
 controls.append(tabs,intervals);
 const rangeButtons=choices(range,[['history','sixty_days'],['month','month_compare']],key=>{mode=key;draw();});
 const metricButtons=choices(tabs,[['sales','sales'],['profit','overview_profit_short'],['orders','invoice_count']],key=>{metric=key;draw();});
 const intervalButtons=choices(intervals,[['daily','daily_view'],['weekly','weekly_view'],['monthly','monthly_view']],key=>{interval=key;draw();});
 topControls.append(toggle,range);
 head.append(title,topControls);
 const period=el('p','overview-chart-period');
 const summary=el('div','shop-chart-summary');
 const amount=el('strong'),delta=el('span','shop-growth-badge');
 summary.append(amount,delta);
 const caption=el('button','shop-chart-caption');
 caption.type='button';
 caption.addEventListener('click',()=>{mode=mode==='history'?'month':'history';draw();});
 const legend=el('div','shop-chart-legend');
 const frame=el('div','shop-chart-frame');
 const axis=el('div','shop-chart-axis'),plot=el('div','shop-chart-plot');
 const tooltip=el('div','shop-chart-tooltip');
 frame.append(axis,plot);
 const dates=el('div','shop-chart-dates'),foot=el('p','shop-comparison-note');
 const graph=el('div','overview-chart-graph');
 graph.append(legend,frame,dates,foot);
 host.append(head,period,controls,summary,caption,graph);
 const dateFormat=new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',timeZone:'UTC'});
 const date=day=>dateFormat.format(new Date(day+'T12:00:00Z'));
 const number=new Intl.NumberFormat(locale);
 const compact=new Intl.NumberFormat(locale,{style:'currency',currency,notation:'compact',maximumFractionDigits:1});
 const fmt=value=>metric==='orders'?number.format(value):money(value);

 function choices(container,options,change){
  return options.map(([key,label])=>{
   const button=el('button',null,t(label));
   button.type='button';
   button.addEventListener('click',()=>change(key));
   container.append(button);
   return [key,button];
  });
 }
 function mark(buttons,current){
  for(const [key,button] of buttons)button.setAttribute('aria-pressed',String(key===current));
 }
 function updateVisibility(){
  graph.hidden=!visible;
  toggle.setAttribute('aria-checked',String(visible));
 }
 function draw(){
  mark(rangeButtons,mode);
  mark(metricButtons,metric);
  mark(intervalButtons,interval);
  updateVisibility();
  const daily=mode==='history'?comparison.history:comparison.current;
  const current=groupChartDays(daily,interval,mode==='month');
  const previous=mode==='month'?groupChartDays(comparison.previous,interval,true):[];
  const total=daily.reduce((sum,row)=>sum+row[metric],0);
  const count=daily.reduce((sum,row)=>sum+row.orders,0);
  const currentValue=mode==='month'?comparison.currentMatchedTotal[metric]:daily.slice(30).reduce((sum,row)=>sum+row[metric],0);
  const previousValue=mode==='month'?comparison.previousTotal[metric]:daily.slice(0,30).reduce((sum,row)=>sum+row[metric],0);
  const change=growthChange(currentValue,previousValue);
  const dateRange=`${date(daily[0].day)} – ${date(daily.at(-1).day)}`;
  period.replaceChildren(uiIcon('overview'),document.createTextNode(dateRange));
  amount.textContent=fmt(total);
  delta.className='shop-growth-badge '+change.state;
  const percent=new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(change.percent);
  delta.textContent=change.percent===null?t(change.state==='empty'?'no_previous_sales':'new_vs_previous'):`${change.percent>0?'↗ +':''}${percent}%`;
  caption.setAttribute('aria-label',t(mode==='history'?'month_compare':'sixty_days'));
  caption.textContent=`${dateRange} · ${number.format(count)} ${t('invoice_count')} ⌄`;
  legend.hidden=previous.length===0;
  foot.hidden=previous.length===0;
  legend.replaceChildren(el('span','legend-current',t('this_month')),el('span','legend-previous',t('previous_month')));
  foot.textContent=`${t('fair_month_compare')} · ${date(comparison.previousFrom)} – ${date(comparison.previousTo)}`;

  const values=[...current,...previous].map(row=>row[metric]);
  const min=Math.min(0,...values),max=Math.max(1,...values);
  const width=660,height=160,top=12,bottom=148,left=6,right=649;
  const steps=Math.max(1,current.length-1,previous.length-1);
  const x=index=>left+index*(right-left)/steps;
  const y=value=>bottom-(value-min)/(max-min)*(bottom-top);
  const points=current.map((row,index)=>[x(index),y(row[metric])]);
  const line=curve(points);
  const image=svg('svg',{viewBox:`0 0 ${width} ${height}`,preserveAspectRatio:'none',role:'img',tabindex:'0','aria-label':`${t('business_performance')} · ${fmt(total)} · ${dateRange}`});
  const defs=svg('defs',{});
  const gradient=svg('linearGradient',{id:'performance-fill',x1:'0',y1:'0',x2:'0',y2:'1'});
  gradient.append(svg('stop',{offset:'0%','stop-color':'#38c674','stop-opacity':'.36'}),svg('stop',{offset:'100%','stop-color':'#38c674','stop-opacity':'.04'}));
  defs.append(gradient);
  image.append(defs);
  for(const value of [max,(max+min)/2,min])image.append(svg('path',{d:`M${left} ${y(value)}H${right}`,stroke:'#dce7df','stroke-dasharray':'3 5','vector-effect':'non-scaling-stroke'}));
  image.append(svg('path',{d:`${line} L${points.at(-1)[0]} ${y(0)} L${left} ${y(0)}Z`,fill:'url(#performance-fill)'}));
  const stroke={fill:'none','stroke-width':'2.5','stroke-linecap':'round','vector-effect':'non-scaling-stroke'};
  if(previous.length)image.append(svg('path',{...stroke,d:curve(previous.map((row,index)=>[x(index),y(row[metric])])),stroke:'#68886d','stroke-dasharray':'4 5'}));
  image.append(svg('path',{...stroke,d:line,stroke:green}));
  const cross=svg('line',{y1:top,y2:bottom,stroke:'#7a9b83','stroke-dasharray':'3 4',visibility:'hidden'});
  const dot=svg('circle',{r:4,fill:'#fff',stroke:green,'stroke-width':'2',visibility:'hidden','vector-effect':'non-scaling-stroke'});
  const last=points.at(-1);
  image.append(svg('circle',{cx:last[0],cy:last[1],r:3.4,fill:green}),cross,dot);
  plot.replaceChildren(image,tooltip);
  tooltip.hidden=true;
  axis.replaceChildren(...[max,(max+min)/2,min].map(value=>el('span',null,metric==='orders'?number.format(value):compact.format(value/currencyScale(currency)))));
  dates.replaceChildren(el('span',null,date(daily[0].day)),el('span',null,date(daily[Math.floor((daily.length-1)/2)].day)),el('span',null,date(daily.at(-1).day)));

  function inspect(index){
   selected=Math.max(0,Math.min(current.length-1,index));
   const row=current[selected],past=previous[selected];
   tooltip.replaceChildren(el('strong',null,date(row.day)),el('span',null,fmt(row[metric])));
   if(past)tooltip.append(el('span',null,`${t('previous_month')} · ${date(past.day)} · ${fmt(past[metric])}`));
   tooltip.hidden=false;
   tooltip.style.left=Math.max(0,Math.min(plot.clientWidth-230,x(selected)/width*plot.clientWidth-60))+'px';
   cross.setAttribute('x1',x(selected));
   cross.setAttribute('x2',x(selected));
   cross.setAttribute('visibility','visible');
   dot.setAttribute('cx',x(selected));
   dot.setAttribute('cy',y(row[metric]));
   dot.setAttribute('visibility','visible');
  }
  function inspectPointer(event){
   const bounds=image.getBoundingClientRect();
   inspect(Math.round(((event.clientX-bounds.left)/bounds.width*width-left)/(right-left)*steps));
  }
  image.addEventListener('pointermove',inspectPointer);
  image.addEventListener('click',inspectPointer);
  image.addEventListener('pointerleave',()=>{
   tooltip.hidden=true;
   cross.setAttribute('visibility','hidden');
   dot.setAttribute('visibility','hidden');
  });
  image.addEventListener('keydown',event=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   event.preventDefault();
   inspect(event.key==='Home'?0:event.key==='End'?current.length-1:selected+(event.key==='ArrowRight'?1:-1));
  });
 }
 draw();
}
