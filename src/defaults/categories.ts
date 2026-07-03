import type { CategoriesFile } from '../lib/types'

export const defaultCategories: CategoriesFile = {
  categories: [
    {
      id: 'food-drink',
      name: 'Food & Drink',
      emoji: '🍽️',
      type: 'expense',
      hints: ['tea', 'coffee', 'chai', 'swiggy', 'zomato', 'restaurant', 'lunch', 'dinner', 'breakfast', 'snacks'],
    },
    {
      id: 'transport',
      name: 'Transport',
      emoji: '🛺',
      type: 'expense',
      hints: ['auto', 'uber', 'ola', 'rapido', 'metro', 'bus', 'train', 'petrol', 'fuel', 'cab'],
    },
    {
      id: 'groceries',
      name: 'Groceries',
      emoji: '🛒',
      type: 'expense',
      hints: ['bigbasket', 'blinkit', 'zepto', 'dmart', 'grocery', 'vegetables', 'fruits', 'milk'],
    },
    {
      id: 'bills',
      name: 'Bills & Utilities',
      emoji: '🧾',
      type: 'expense',
      hints: ['electricity', 'recharge', 'wifi', 'broadband', 'rent', 'gas', 'water', 'maintenance', 'mobile'],
    },
    {
      id: 'shopping',
      name: 'Shopping',
      emoji: '🛍️',
      type: 'expense',
      hints: ['amazon', 'flipkart', 'myntra', 'clothes', 'shoes', 'electronics'],
    },
    {
      id: 'health',
      name: 'Health',
      emoji: '💊',
      type: 'expense',
      hints: ['pharmacy', 'medicine', 'doctor', 'apollo', 'hospital', 'gym'],
    },
    {
      id: 'entertainment',
      name: 'Entertainment',
      emoji: '🎬',
      type: 'expense',
      hints: ['movie', 'netflix', 'spotify', 'prime', 'hotstar', 'game', 'concert'],
    },
    {
      id: 'salary',
      name: 'Salary',
      emoji: '💼',
      type: 'income',
      hints: ['salary', 'payroll'],
    },
    {
      id: 'other-income',
      name: 'Other Income',
      emoji: '💰',
      type: 'income',
      hints: ['refund', 'cashback', 'interest', 'dividend', 'received'],
    },
    {
      id: 'other',
      name: 'Other',
      emoji: '📦',
      type: 'expense',
      hints: [],
    },
  ],
}
