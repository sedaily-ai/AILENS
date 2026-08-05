export interface CommunityComment {
  id: string;
  userName: string;
  userMbti: string;
  userAvatar: string;
  text: string;
  timeAgo: string;
  likes: number;
}

export interface CommunityPost {
  id: string;
  userName: string;
  userMbti: string;
  userAvatar: string;
  timeAgo: string;
  archivedSentence: string;
  userComment: string;
  articleTitle: string;
  tags: string[];
  upvotes: number;
  commentCount: number;
  commentList: CommunityComment[];
}
