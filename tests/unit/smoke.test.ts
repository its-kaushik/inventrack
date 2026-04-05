import { describe, it, expect } from 'vitest';
import { CONSTANTS } from '../../src/config/constants.js';
import { AppError } from '../../src/types/errors.js';
import { validate, paginationSchema, phoneSchema, moneySchema } from '../../src/validators/common.validators.js';

describe('M1 Smoke Tests', () => {
  describe('Constants', () => {
    it('has correct default pagination values', () => {
      expect(CONSTANTS.PAGINATION.DEFAULT_PAGE).toBe(1);
      expect(CONSTANTS.PAGINATION.DEFAULT_LIMIT).toBe(50);
      expect(CONSTANTS.PAGINATION.MAX_LIMIT).toBe(200);
    });

    it('has correct auth constants', () => {
      expect(CONSTANTS.AUTH.PIN_MAX_ATTEMPTS).toBe(5);
      expect(CONSTANTS.AUTH.PIN_LOCKOUT_MINUTES).toBe(15);
    });

    it('has correct financial year start month', () => {
      expect(CONSTANTS.FINANCIAL_YEAR.START_MONTH).toBe(3); // April (0-indexed)
    });
  });

  describe('AppError', () => {
    it('creates error with all fields', () => {
      const error = new AppError('VALIDATION_ERROR', 'Bad input', 400, [{ field: 'name' }]);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Bad input');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual([{ field: 'name' }]);
      expect(error.name).toBe('AppError');
      expect(error).toBeInstanceOf(Error);
    });

    it('defaults statusCode to 500', () => {
      const error = new AppError('INTERNAL_ERROR', 'Oops');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('Validators', () => {
    it('validates pagination with defaults', () => {
      const result = validate(paginationSchema, {});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('validates pagination with custom values', () => {
      const result = validate(paginationSchema, { page: '3', limit: '25' });
      expect(result.page).toBe(3);
      expect(result.limit).toBe(25);
    });

    it('rejects pagination limit exceeding max', () => {
      expect(() => validate(paginationSchema, { limit: 500 })).toThrow(AppError);
    });

    it('validates phone number', () => {
      const result = validate(phoneSchema, '9876543210');
      expect(result).toBe('9876543210');
    });

    it('rejects invalid phone number', () => {
      expect(() => validate(phoneSchema, '123')).toThrow(AppError);
      expect(() => validate(phoneSchema, 'abcdefghij')).toThrow(AppError);
    });

    it('validates money amounts', () => {
      const result = validate(moneySchema, '199.99');
      expect(result).toBe(199.99);
    });

    it('rejects negative money', () => {
      expect(() => validate(moneySchema, -10)).toThrow(AppError);
    });
  });
});
