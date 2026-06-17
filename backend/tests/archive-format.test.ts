import { describe, expect, it } from 'vitest';
import {
  archiveDisplayContent,
  extractMediaCandidates,
} from '../src/modules/archive/archive-format.js';

describe('archive formatting', () => {
  it('uses readable metadata instead of rendering raw JSON', () => {
    const content = JSON.stringify({
      title: 'Ảnh xác nhận đơn hàng',
      href: 'http://localhost:9000/zalocrm-attachments/order.jpg',
      params: { width: 1440, height: 2560 },
    });

    expect(archiveDisplayContent(content, 'image')).toBe('Ảnh xác nhận đơn hàng');
  });

  it('shows a media placeholder when JSON contains no readable text', () => {
    const content = JSON.stringify({
      href: 'http://localhost:9000/zalocrm-attachments/order.jpg',
      params: { width: 1440, height: 2560 },
    });

    expect(archiveDisplayContent(content, 'image')).toBe('[image]');
  });

  it('extracts media URLs embedded in message JSON', () => {
    const content = JSON.stringify({
      title: '',
      description: '',
      href: 'http://localhost:9000/zalocrm-attachments/order.jpg',
      thumbnail: 'http://localhost:9000/zalocrm-attachments/order-thumb.jpg',
    });

    expect(extractMediaCandidates('image', null, content)).toEqual([
      {
        url: 'http://localhost:9000/zalocrm-attachments/order.jpg',
        mediaType: 'image',
      },
      {
        url: 'http://localhost:9000/zalocrm-attachments/order-thumb.jpg',
        mediaType: 'image',
      },
    ]);
  });
});
