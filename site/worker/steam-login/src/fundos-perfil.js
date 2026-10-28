export const FUNDOS_PERFIL = ['mirage', 'inferno', 'dust2', 'ancient', 'anubis', 'nuke', 'overpass', 'train', 'vertigo', 'cache']
export const nomeFundoPerfil = id => id === 'dust2' ? 'Dust II' : id.charAt(0).toUpperCase() + id.slice(1)
export const imagemFundoPerfil = id => `/neurapick/maps/${FUNDOS_PERFIL.includes(id) ? id : 'mirage'}.jpg`
