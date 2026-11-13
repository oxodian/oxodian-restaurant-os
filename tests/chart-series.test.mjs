import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chartSeries} from '../public/workspace-design.js';
import {groupChartDays} from '../public/monthly-chart.js';

test('sales chart fills zero-sale days and preserves the actual period total',()=>{
 const d={from:'2026-10-11',to:'2026-11-09',daily:[{day:'2026-11-02',total:10000},{day:'2026-11-05',total:25000},{day:'2026-11-09',total:5000}]};
 const week=chartSeries(d,7);assert.equal(week.length,7);assert.equal(week[0].day,'2026-11-03');assert.equal(week.at(-1).day,'2026-11-09');assert.equal(week.reduce((sum,x)=>sum+x.total,0),30000);assert.equal(week.find(x=>x.day==='2026-11-06').total,0);
 const month=chartSeries(d,30);assert.equal(month.length,30);assert.equal(month.reduce((sum,x)=>sum+x.total,0),40000);
});
test('a custom one-day reporting range never invents days outside the fetched range',()=>{
 const points=chartSeries({from:'2026-11-09',to:'2026-11-09',daily:[{day:'2026-11-09',total:15900}]},30);assert.deepEqual(points,[{day:'2026-11-09',total:15900}]);
});

test('overview periods preserve sales, profit and bills across calendar boundaries',()=>{
 const rows=[{day:'2026-10-31',sales:150,profit:-5,orders:1},{day:'2026-11-01',sales:200,profit:50,orders:2},{day:'2026-11-02',sales:300,profit:85,orders:3}];
 assert.deepEqual(groupChartDays(rows,'daily'),rows);
 assert.deepEqual(groupChartDays(rows,'weekly'),[{day:'2026-10-31',sales:350,profit:45,orders:3},rows[2]]);
 assert.deepEqual(groupChartDays(rows,'monthly'),[rows[0],{day:'2026-11-01',sales:500,profit:135,orders:5}]);
 assert.deepEqual(groupChartDays(rows,'weekly',true),[{day:'2026-10-31',sales:650,profit:130,orders:6}]);
});
