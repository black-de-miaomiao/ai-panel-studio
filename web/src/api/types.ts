import type {
  CreateDiscussionRequest,
  Discussion,
  DiscussionListItem,
  DiscussionStatus,
  DiscussionSnapshot,
  HealthResponse
} from '@aps/shared';

export interface DiscussionApi {
  getHealth(): Promise<HealthResponse>;
  listDiscussions(
    statuses?: readonly DiscussionStatus[]
  ): Promise<DiscussionListItem[]>;
  createDiscussion(
    request: CreateDiscussionRequest
  ): Promise<DiscussionSnapshot>;
  getDiscussion(id: string): Promise<DiscussionSnapshot>;
  regenerateLineup(id: string): Promise<DiscussionSnapshot>;
  start(id: string): Promise<Discussion>;
  pause(id: string): Promise<Discussion>;
  resume(id: string): Promise<Discussion>;
  end(id: string): Promise<Discussion>;
  deleteDiscussion(id: string): Promise<void>;
}
