import type { HaBackend } from './types';

/** One entry in a `media_player/browse_media` response. */
export interface BrowseMediaItem {
  title: string;
  media_class: string;
  media_content_type: string;
  media_content_id: string;
  can_play: boolean;
  can_expand: boolean;
  thumbnail?: string | null;
}

export interface BrowseMediaNode extends BrowseMediaItem {
  children?: BrowseMediaItem[];
}

/**
 * Walks the same tree HA's own "Browse media" dialog does — the root with no
 * `target` lists a player's sources (Favorites, Playlists, …); passing one
 * back in descends into it. This is how the preset editor grabs a station's
 * real `media_content_id`/`media_content_type` instead of a user copying one
 * off a resolved stream URL, which is often session-bound and won't replay.
 */
export async function browseMedia(
  backend: HaBackend,
  entityId: string,
  target?: { media_content_id: string; media_content_type: string },
): Promise<BrowseMediaNode> {
  return backend.sendMessagePromise<BrowseMediaNode>({
    type: 'media_player/browse_media',
    entity_id: entityId,
    ...(target ?? {}),
  });
}
