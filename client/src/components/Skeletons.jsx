import { useLocation } from 'react-router-dom';
import { BrandMark } from './Logo';

/**
 * Loading placeholders shaped like the real screens, so a tap on a tab shows
 * the page instantly and the content fills in when the data arrives.
 */
export function Sk({ w = '100%', h = 14, r = 8, style }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r, flex: 'none', ...style }} />;
}

export function HeadSkeleton({ right = true }) {
  return (
    <div className="page-head" aria-hidden="true">
      <div className="stack" style={{ gap: 12 }}>
        <Sk w={120} h={11} />
        <Sk w={260} h={38} r={10} style={{ maxWidth: '70vw' }} />
      </div>
      {right && <Sk w={150} h={40} r={12} />}
    </div>
  );
}

export function RowsSkeleton({ rows = 6 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="row" style={{ padding: '12px 8px', gap: 14 }}>
          <Sk w={40} h={40} r={13} />
          <div className="stack" style={{ flex: 1, gap: 8 }}>
            <Sk w={`${55 - (i % 3) * 10}%`} h={13} />
            <Sk w={`${30 + (i % 2) * 8}%`} h={10} />
          </div>
          <Sk w={64} h={14} />
        </div>
      ))}
    </div>
  );
}

function CardSkeleton({ children, style }) {
  return <div className="card sk-card" style={style}>{children}</div>;
}

export function DashboardSkeleton() {
  return (
    <div className="stack" style={{ gap: 18 }} aria-busy="true" aria-label="Loading">
      <div className="grid g-main">
        <div className="skeleton sk-hero" />
        <div className="grid g-2 keep-2" style={{ gap: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <CardSkeleton key={i} style={{ padding: 18 }}>
              <div className="row" style={{ gap: 8 }}><Sk w={26} h={26} r={9} /><Sk w={60} h={11} /></div>
              <Sk w="70%" h={28} r={8} style={{ marginTop: 14 }} />
              <Sk w="50%" h={10} style={{ marginTop: 10 }} />
            </CardSkeleton>
          ))}
        </div>
      </div>
      <div className="grid g-main">
        <CardSkeleton>
          <Sk w={130} h={14} />
          <Sk w={200} h={10} style={{ marginTop: 8 }} />
          <div className="sk-chart">
            {[38, 52, 46, 64, 58, 72, 66, 84, 78, 90].map((h, i) => <div key={i} className="skeleton" style={{ height: `${h}%` }} />)}
          </div>
        </CardSkeleton>
        <CardSkeleton>
          <Sk w={110} h={14} />
          <div style={{ display: 'grid', placeItems: 'center', margin: '22px 0' }}>
            <div className="sk-donut" />
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="row" style={{ padding: '7px 0' }}><Sk w={10} h={10} r={3} /><Sk w={`${50 - i * 6}%`} h={11} /><div className="spacer" /><Sk w={60} h={11} /></div>
          ))}
        </CardSkeleton>
      </div>
      <div className="grid g-main">
        <CardSkeleton><Sk w={120} h={14} style={{ marginBottom: 8 }} /><RowsSkeleton rows={5} /></CardSkeleton>
        <CardSkeleton><Sk w={90} h={14} style={{ marginBottom: 14 }} />{[0, 1, 2].map((i) => <Sk key={i} h={44} r={14} style={{ marginBottom: 8 }} />)}</CardSkeleton>
      </div>
    </div>
  );
}

export function TransactionsSkeleton() {
  return (
    <>
      <CardSkeleton style={{ padding: 16, marginBottom: 18 }}>
        <div className="row row-wrap" style={{ gap: 10 }}>
          <Sk w="auto" h={42} r={12} style={{ flex: '1 1 240px' }} />
          <Sk w={300} h={40} r={13} style={{ maxWidth: '100%' }} />
        </div>
        <div className="row" style={{ marginTop: 14, gap: 8, overflow: 'hidden' }}>
          {[96, 80, 88, 110, 76, 92].map((w, i) => <Sk key={i} w={w} h={32} r={99} />)}
        </div>
      </CardSkeleton>
      <CardSkeleton style={{ padding: '6px 14px' }}>
        <Sk w={90} h={10} style={{ margin: '18px 8px 6px' }} />
        <RowsSkeleton rows={7} />
      </CardSkeleton>
    </>
  );
}

export function GroupsSkeleton() {
  return (
    <div className="grid g-3" aria-busy="true" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <CardSkeleton key={i} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <Sk w={52} h={52} r={16} />
            <div className="row" style={{ gap: 0 }}>{[0, 1, 2].map((j) => <Sk key={j} w={28} h={28} r={9} style={{ marginLeft: -6, border: '2px solid #fff' }} />)}</div>
          </div>
          <Sk w="60%" h={24} r={8} />
          <Sk w="80%" h={10} />
          <div className="row" style={{ justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <Sk w={80} h={11} /><Sk w={70} h={14} />
          </div>
        </CardSkeleton>
      ))}
    </div>
  );
}

export function GroupDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Sk w={90} h={12} style={{ marginBottom: 18 }} />
      <div className="page-head">
        <div className="row" style={{ gap: 16 }}>
          <Sk w={68} h={68} r={22} />
          <div className="stack" style={{ gap: 10 }}><Sk w={130} h={11} /><Sk w={220} h={36} r={10} style={{ maxWidth: '55vw' }} /></div>
        </div>
        <div className="row"><Sk w={96} h={40} r={12} /><Sk w={130} h={40} r={12} /></div>
      </div>
      <div className="grid g-main">
        <div className="stack" style={{ gap: 18 }}>
          <div className="skeleton sk-hero" style={{ height: 160 }} />
          <CardSkeleton><Sk w={80} h={14} style={{ marginBottom: 8 }} /><RowsSkeleton rows={4} /></CardSkeleton>
        </div>
        <div className="stack" style={{ gap: 18 }}>
          <CardSkeleton>
            <Sk w={90} h={14} style={{ marginBottom: 12 }} />
            {[0, 1].map((i) => (
              <div key={i} className="row" style={{ padding: '10px 0' }}><Sk w={28} h={28} r={9} /><div className="stack" style={{ flex: 1, gap: 6 }}><Sk w="70%" h={12} /><Sk w={60} h={12} /></div><Sk w={64} h={32} r={10} /></div>
            ))}
          </CardSkeleton>
          <CardSkeleton>
            <Sk w={80} h={14} style={{ marginBottom: 12 }} />
            {[0, 1, 2].map((i) => (
              <div key={i} className="row" style={{ padding: '8px 0' }}><Sk w={28} h={28} r={9} /><div className="stack" style={{ flex: 1, gap: 6 }}><Sk w="55%" h={12} /><Sk w="30%" h={9} /></div><Sk w={56} h={12} /></div>
            ))}
          </CardSkeleton>
        </div>
      </div>
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className="stack" style={{ gap: 18 }}>
      {[0, 1].map((i) => (
        <CardSkeleton key={i}>
          <div className="row" style={{ gap: 12, marginBottom: 18 }}><Sk w={38} h={38} r={12} /><div className="stack" style={{ flex: 1, gap: 8 }}><Sk w="40%" h={14} /><Sk w="70%" h={10} /></div></div>
          {[0, 1, 2].map((j) => (
            <div key={j} className="row" style={{ padding: '10px 0', gap: 12 }}><Sk w={28} h={28} r={99} /><div className="stack" style={{ flex: 1, gap: 8 }}><Sk w="35%" h={12} /><Sk w="65%" h={10} /></div></div>
          ))}
        </CardSkeleton>
      ))}
    </div>
  );
}

/** Shown while a screen's code is still downloading (first visit to a tab). */
export function RouteSkeleton() {
  const { pathname } = useLocation();
  let body = <CardsSkeleton />;
  let right = false;
  if (pathname === '/') { body = <DashboardSkeleton />; right = true; }
  else if (pathname.startsWith('/transactions')) { body = <TransactionsSkeleton />; right = true; }
  else if (/^\/splits\/\d+/.test(pathname)) return <div className="page"><GroupDetailSkeleton /></div>;
  else if (pathname.startsWith('/splits')) { body = <GroupsSkeleton />; right = true; }
  return (
    <div className="page">
      <HeadSkeleton right={right} />
      {body}
    </div>
  );
}

/** Whole-app placeholder while the session is being checked on first open. */
export function AppBootSkeleton() {
  return (
    <div className="shell" aria-busy="true" aria-label="Loading Jellyfish">
      <aside className="sidebar">
        <div className="brand"><BrandMark /><span className="brand-name">Jellyfish</span></div>
        <Sk h={44} r={12} style={{ marginBottom: 14 }} />
        {[0, 1, 2, 3, 4].map((i) => <Sk key={i} h={38} r={12} style={{ marginBottom: 6, opacity: 0.7 }} />)}
      </aside>
      <main className="main">
        <div className="mobile-top">
          <div className="row" style={{ gap: 8 }}><BrandMark size={30} /><span className="brand-name" style={{ fontSize: 24 }}>Jellyfish</span></div>
          <Sk w={28} h={28} r={9} />
        </div>
        <div className="page">
          <HeadSkeleton />
          <DashboardSkeleton />
        </div>
      </main>
    </div>
  );
}
