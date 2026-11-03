import { Skeleton } from '../ui/Skeleton';

interface LineupSkeletonProps {
  expertCount?: number;
}

export function LineupSkeleton({
  expertCount = 4
}: LineupSkeletonProps) {
  return (
    <div className="lineup-skeleton" aria-label="正在生成嘉宾阵容" role="status">
      <article className="host-lineup-card host-lineup-card--skeleton">
        <Skeleton className="skeleton-line--short" />
        <div className="lineup-skeleton__identity">
          <Skeleton variant="circle" />
          <div>
            <Skeleton className="skeleton-line--medium" />
            <Skeleton className="skeleton-line--short" />
          </div>
        </div>
        <Skeleton />
      </article>
      <div className="lineup-skeleton__guests">
        {Array.from({ length: expertCount }, (_, index) => (
          <article className="lineup-skeleton__guest" key={index}>
            <Skeleton className="skeleton-line--short" />
            <div className="lineup-skeleton__identity">
              <Skeleton variant="circle" />
              <div>
                <Skeleton className="skeleton-line--medium" />
                <Skeleton className="skeleton-line--short" />
              </div>
            </div>
            <Skeleton />
            <Skeleton className="skeleton-line--short" />
          </article>
        ))}
      </div>
    </div>
  );
}
