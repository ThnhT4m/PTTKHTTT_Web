// Explicit project catalogue enrichment through the unmodified Backend API.
// Does not create bookings, payments, refunds, revenue or reviews.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { assertOperationalDatabase } from '../lib/databaseSafety.mjs';
assertOperationalDatabase(process.env.DATABASE_URL);
assert.equal(process.env.PAYMENT_SANDBOX_ENABLED, 'false');
const origin = 'http://127.0.0.1:4006/api';
const changes = [];
async function account(name) {
  const response = await fetch(origin+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:name+'@example.com',password:'Demo@12345'})});
  const body = await response.json(); assert.equal(response.status,200,body.error?.message);
  const token = body.data.token;
  return async (method,path,values) => {
    assert.ok(!/\/(bookings|payments|reviews|refunds)/.test(path));
    const response=await fetch(origin+path,{method,headers:{Authorization:'Bearer '+token,...(values?{'Content-Type':'application/json'}:{})},...(values?{body:JSON.stringify(values)}:{})});
    const result=await response.json();assert.ok(response.ok,result.error?.message);return result.data;
  };
}
const originalDescriptions = new Set(['Cụm sân bóng đá và cầu lông; dữ liệu mẫu phục vụ phát triển.','Cụm sân pickleball và tennis; quản lý độc lập để kiểm thử quyền sở hữu.','Cụm sân bóng rổ và cầu lông; dữ liệu mẫu.']);
const venues = [
  ['Thể thao Thủ Đức','Không gian vận động dành cho nhóm bạn và gia đình, với sân bóng đá cỏ nhân tạo và khu cầu lông trong nhà. Có khu nghỉ và chỗ gửi xe.'],
  ['Thể thao Bình Thạnh','Cụm sân tennis và pickleball dành cho người chơi phong trào. Mặt sân được chăm sóc thường xuyên, có đèn phục vụ các buổi tập tối.'],
  ['Thể thao Quận 7','Khu sân bóng rổ ngoài trời và cầu lông trong nhà, phù hợp tập luyện hằng ngày và các buổi giao lưu cuối tuần.'],
];
for(const manager of ['manager1','manager2']) {
  const api=await account(manager),list=await api('GET','/venues?mine=true&limit=300');
  for(const [name,description]of venues) {
    const venue=list.find(v=>v.name===name);if(!venue)continue;
    if(venue.description!==description && originalDescriptions.has(venue.description)){const updated=await api('PATCH',`/venues/${venue.id}`,{description,expected_version:venue.version});changes.push({action:'update_description',entity:'venue',id:updated.id,name});}
  }
}
const api=await account('manager2');
let venue=(await api('GET','/venues?mine=true&limit=300')).find(v=>v.name==='Sân Nhà Bình Tân');
if(!venue){venue=await api('POST','/venues',{name:'Sân Nhà Bình Tân',address:'66 Đường số 7, Bình Tân, TP. Hồ Chí Minh',district:'Bình Tân',description:'Điểm hẹn thể thao khu dân cư với sân cầu lông, tennis và bóng rổ. Phục vụ các nhóm tập luyện, câu lạc bộ và gia đình.',payment_hold_minutes:5,minimum_online_booking_lead_minutes:10});changes.push({action:'create',entity:'venue',id:venue.id,name:venue.name});}
const courts=[
  {name:'Sân cầu lông trong nhà',sport_type:'BADMINTON',hourly_price:90000,description:'Sân thảm trong nhà, ánh sáng đều, có ghế nghỉ cạnh sân.'},
  {name:'Sân tennis ngoài trời',sport_type:'TENNIS',hourly_price:220000,description:'Sân cứng ngoài trời, có đèn cho các buổi tập sau giờ làm.'},
  {name:'Sân bóng rổ cộng đồng',sport_type:'BASKETBALL',hourly_price:180000,description:'Sân bóng rổ ngoài trời, phù hợp nhóm bạn và hoạt động câu lạc bộ.'},
];
let existing=await api('GET',`/venues/${venue.id}/courts?limit=300`);
for(const court of courts)if(!existing.some(c=>c.name===court.name)){const created=await api('POST',`/venues/${venue.id}/courts`,court);changes.push({action:'create',entity:'court',id:created.id,...court});}
const schedule=await api('POST',`/venues/${venue.id}/generate-slots`,{days:30});
changes.push({action:'generate_slots',venue:venue.id,...schedule});
await writeFile(new URL('../../.local/catalog-provenance.json',import.meta.url),JSON.stringify({purpose:'Danh mục minh họa phục vụ đồ án Sân Nhà; không đại diện cơ sở thương mại được xác minh.',source:'Migration/seed gốc khi DB trống; mô tả và cơ sở bổ sung qua API gốc theo TASK 6.1.',time:new Date().toISOString(),changes,financialTransactionsCreated:0},null,2));
console.log(JSON.stringify({catalogChanges:changes.length,newVenue:venue.name,courts:3,slots:schedule.created,financialTransactionsCreated:0}));
