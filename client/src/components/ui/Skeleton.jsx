// src/components/ui/Skeleton.jsx
export function Skeleton({ className = '', width, height, rounded = 'rounded-lg' }) {
  return (
    <div
      className={`skeleton ${rounded} ${className}`}
      style={{ width: width || '100%', height: height || '20px' }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <Skeleton height="14px" width="40%" className="mb-3" />
      <Skeleton height="32px" width="60%" className="mb-4" />
      <Skeleton height="120px" className="mb-2" />
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <Skeleton height="18px" width="50%" className="mb-6" />
      <Skeleton height="240px" />
    </div>
  );
}
