import { MapPin, CalendarDays } from 'lucide-react';
export default function VenueHero() { return <>
      <section className="hero">
        <div className="hero__content">
          <span className="hero__eyebrow">
            <span />
            SÂN SẴN SÀNG. BẠN THÌ SAO?
          </span>
          <h1 className="hero__title">
            Tìm sân đúng ý.
            <br />
            <em>Chơi hết mình.</em>
          </h1>
          <p className="hero__description">
            Từ một trận cầu sau giờ làm đến cuối tuần cùng đồng đội. Chọn sân và khung giờ phù hợp
            với bạn.
          </p>
          <div className="hero__pill">
            <MapPin size={16} /> Khám phá các sân tại TP. Hồ Chí Minh
          </div>
        </div>
        <div className="hero__visual" aria-hidden="true">
          <div className="hero__orbit" />
          <div className="court-art court-art--hero">
            <span className="court-art__circle" />
            <span className="court-art__net" />
          </div>
          <div className="hero__float">
            <CalendarDays size={22} />
            <span>
              Hẹn nhau trên sân<strong>06:00 – 22:00 mỗi ngày</strong>
            </span>
          </div>
          <span className="hero__ball">✦</span>
        </div>
      </section>
      <div className="stat-strip">
        <div className="stat-strip__item">
          <strong>05</strong>
          <span>Bộ môn thể thao</span>
        </div>
        <div className="stat-strip__item">
          <strong>60′</strong>
          <span>Mỗi khung giờ thi đấu</span>
        </div>
        <div className="stat-strip__item">
          <strong>01</strong>
          <span>Nơi cho mọi cuộc hẹn</span>
        </div>
      </div>
</>; }
