import Configstore from 'configstore';
import { NAME } from '../constants/package.mjs';
export const config = new Configstore(NAME, {
  style: 'long',
  description: 'bullet',
  prefix: true,
});
