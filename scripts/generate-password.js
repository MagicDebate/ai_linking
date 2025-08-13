#!/usr/bin/env node

import bcrypt from 'bcrypt';

const password = 'test123';
const hash = bcrypt.hashSync(password, 10);

console.log('Password:', password);
console.log('Hash:', hash);






