import ky from 'ky'

export const query = ky.create({
  prefixUrl: '/',
  credentials: 'include',
})
