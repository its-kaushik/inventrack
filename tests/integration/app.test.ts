import { describe, it, expect } from 'vitest';
import { app } from '../../src/app.js';

describe('App Integration', () => {
  describe('GET /health', () => {
    it('returns health status', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBeDefined();
      expect(body.database).toBeDefined();
      expect(body.uptime).toBeTypeOf('number');
      expect(body.version).toBe('1.0.0');
    });
  });

  describe('404 handling', () => {
    it('returns 401 for unknown authenticated routes (auth comes before 404)', async () => {
      const res = await app.request('/api/v1/nonexistent');
      expect(res.status).toBe(401);
    });

    it('returns 404 for unknown non-API routes', async () => {
      const res = await app.request('/nonexistent');
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('CORS headers', () => {
    it('includes CORS headers on responses', async () => {
      const res = await app.request('/health', {
        headers: { Origin: 'http://localhost:5173' },
      });
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    });
  });

  describe('Request ID', () => {
    it('returns X-Request-Id header', async () => {
      const res = await app.request('/health');
      expect(res.headers.get('x-request-id')).toBeTruthy();
    });

    it('echoes back provided request ID', async () => {
      const res = await app.request('/health', {
        headers: { 'X-Request-Id': 'test-req-123' },
      });
      expect(res.headers.get('x-request-id')).toBe('test-req-123');
    });
  });

  describe('Swagger UI (development)', () => {
    it('serves OpenAPI JSON', async () => {
      const res = await app.request('/api/openapi.json');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.openapi).toBe('3.1.0');
      expect(body.info.title).toBe('InvenTrack API');
    });

    it('serves Swagger UI page', async () => {
      const res = await app.request('/docs');
      expect(res.status).toBe(200);
    });
  });
});
