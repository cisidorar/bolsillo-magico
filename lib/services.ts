/**
 * Mapa de servicios comunes → dominio para Clearbit Logo API
 * Clave: keyword en minúsculas (puede ser parcial)
 */
export const KNOWN_SERVICES: { keywords: string[]; domain: string }[] = [
  // Streaming video
  { keywords: ['netflix'],                            domain: 'netflix.com'       },
  { keywords: ['disney', 'disney+', 'disneyplus'],   domain: 'disney.com'        },
  { keywords: ['hbo', 'hbo max'],                    domain: 'hbo.com'           },
  { keywords: ['max'],                               domain: 'max.com'           },
  { keywords: ['amazon prime', 'prime video'],        domain: 'amazon.com'        },
  { keywords: ['apple tv', 'apple tv+'],             domain: 'apple.com'         },
  { keywords: ['youtube premium', 'youtube'],         domain: 'youtube.com'       },
  { keywords: ['paramount', 'paramount+'],           domain: 'paramount.com'     },
  { keywords: ['crunchyroll'],                       domain: 'crunchyroll.com'   },
  { keywords: ['mubi'],                              domain: 'mubi.com'          },
  { keywords: ['star+', 'star plus'],                domain: 'starplus.com'      },
  // Música
  { keywords: ['spotify'],                           domain: 'spotify.com'       },
  { keywords: ['apple music'],                       domain: 'apple.com'         },
  { keywords: ['tidal'],                             domain: 'tidal.com'         },
  { keywords: ['deezer'],                            domain: 'deezer.com'        },
  // Cloud & Storage
  { keywords: ['icloud', 'apple icloud'],            domain: 'apple.com'         },
  { keywords: ['google one', 'google drive'],        domain: 'google.com'        },
  { keywords: ['dropbox'],                           domain: 'dropbox.com'       },
  { keywords: ['onedrive', 'microsoft 365', 'office 365', 'microsoft'], domain: 'microsoft.com' },
  // Seguridad / Hogar
  { keywords: ['adt'],                               domain: 'adt.com'           },
  { keywords: ['norton'],                            domain: 'norton.com'        },
  { keywords: ['mcafee'],                            domain: 'mcafee.com'        },
  { keywords: ['nordvpn', 'nord vpn'],               domain: 'nordvpn.com'       },
  { keywords: ['expressvpn'],                        domain: 'expressvpn.com'    },
  { keywords: ['1password'],                         domain: '1password.com'     },
  { keywords: ['lastpass'],                          domain: 'lastpass.com'      },
  // Telecomunicaciones CL
  { keywords: ['entel'],                             domain: 'entel.cl'          },
  { keywords: ['claro'],                             domain: 'claro.cl'          },
  { keywords: ['movistar'],                          domain: 'movistar.cl'       },
  { keywords: ['wom'],                               domain: 'wom.cl'            },
  { keywords: ['vtr'],                               domain: 'vtr.com'           },
  { keywords: ['gtd'],                               domain: 'gtd.com'           },
  // Productividad
  { keywords: ['openai', 'chatgpt', 'chatgpt plus'], domain: 'openai.com'        },
  { keywords: ['notion'],                            domain: 'notion.so'         },
  { keywords: ['slack'],                             domain: 'slack.com'         },
  { keywords: ['zoom'],                              domain: 'zoom.us'           },
  { keywords: ['github'],                            domain: 'github.com'        },
  { keywords: ['adobe'],                             domain: 'adobe.com'         },
  { keywords: ['figma'],                             domain: 'figma.com'         },
  { keywords: ['canva'],                             domain: 'canva.com'         },
  { keywords: ['claude'],                            domain: 'anthropic.com'     },
  // Deporte / Bienestar
  { keywords: ['smartfit', 'smart fit'],             domain: 'smartfit.cl'       },
  { keywords: ['duolingo'],                          domain: 'duolingo.com'      },
  { keywords: ['calm'],                              domain: 'calm.com'          },
  { keywords: ['headspace'],                         domain: 'headspace.com'     },
  // Delivery / Apps
  { keywords: ['uber', 'uber one'],                  domain: 'uber.com'          },
  { keywords: ['rappi', 'rappi prime'],              domain: 'rappi.com'         },
  { keywords: ['pedidosya', 'pedidos ya'],           domain: 'pedidosya.cl'      },
  // Libros / Audios
  { keywords: ['audible'],                           domain: 'audible.com'       },
  { keywords: ['kindle'],                            domain: 'amazon.com'        },
  // Otros
  { keywords: ['twitch'],                            domain: 'twitch.tv'         },
  { keywords: ['tinder'],                            domain: 'tinder.com'        },
  { keywords: ['bumble'],                            domain: 'bumble.com'        },
  { keywords: ['linkedin'],                          domain: 'linkedin.com'      },

  // ── Supermercados y retail Chile ───────────────────────────────────────────
  { keywords: ['jumbo'],                             domain: 'jumbo.cl'          },
  { keywords: ['lider', 'líder', 'super lider', 'superlider'], domain: 'lider.cl' },
  { keywords: ['tottus'],                            domain: 'tottus.cl'         },
  { keywords: ['santa isabel'],                      domain: 'santaisabel.cl'    },
  { keywords: ['unimarc'],                           domain: 'unimarc.cl'        },
  { keywords: ['acuenta'],                           domain: 'acuenta.cl'        },
  { keywords: ['mayorista 10', 'mayorista10'],       domain: 'mayorista10.cl'    },
  { keywords: ['ekono'],                             domain: 'ekono.cl'          },
  { keywords: ['deca'],                              domain: 'supermercadosdeca.cl'},
  { keywords: ['rendic'],                            domain: 'rendic.cl'         },
  { keywords: ['montserrat', 'supermercado montserrat'], domain: 'montserrat.cl' },
  { keywords: ['hiper lider', 'hiperlider'],         domain: 'lider.cl'          },
  { keywords: ['walmart'],                           domain: 'walmart.com'       },
  { keywords: ['costco'],                            domain: 'costco.com'        },
  { keywords: ['falabella'],                         domain: 'falabella.com'     },
  { keywords: ['ripley'],                            domain: 'ripley.com'        },
  { keywords: ['paris'],                             domain: 'paris.cl'          },
  { keywords: ['hites'],                             domain: 'hites.com'         },
  { keywords: ['la polar'],                          domain: 'lapolar.cl'        },
  { keywords: ['sodimac'],                           domain: 'sodimac.com'       },
  { keywords: ['homecenter'],                        domain: 'sodimac.com'       },
  { keywords: ['easy'],                              domain: 'easy.cl'           },
  { keywords: ['ikea'],                              domain: 'ikea.com'          },
  { keywords: ['amazon'],                            domain: 'amazon.com'        },
  { keywords: ['aliexpress', 'ali express'],         domain: 'aliexpress.com'    },
  { keywords: ['mercado libre', 'mercadolibre'],     domain: 'mercadolibre.cl'   },

  // ── Farmacias Chile ────────────────────────────────────────────────────────
  { keywords: ['cruz verde'],                        domain: 'cruzverde.cl'      },
  { keywords: ['ahumada'],                           domain: 'farmaciasahumada.cl'},
  { keywords: ['salcobrand'],                        domain: 'salcobrand.cl'     },
  { keywords: ['dr simi', 'dr. simi', 'similares'],  domain: 'farmaciassimilares.com.mx'},

  // ── Combustible / Transporte ───────────────────────────────────────────────
  { keywords: ['copec'],                             domain: 'copec.cl'          },
  { keywords: ['petrobras', 'pronto copec'],         domain: 'petrobras.com.br'  },
  { keywords: ['shell'],                             domain: 'shell.com'         },
  { keywords: ['enex', 'full'],                      domain: 'enex.cl'           },
  { keywords: ['terpel'],                            domain: 'terpel.com'        },
  { keywords: ['cabify'],                            domain: 'cabify.com'        },
  { keywords: ['indriver', 'in driver'],             domain: 'indrive.com'       },
  { keywords: ['blue express', 'blueexpress'],       domain: 'blue.cl'           },
  { keywords: ['chilexpress'],                       domain: 'chilexpress.cl'    },
  { keywords: ['starken'],                           domain: 'starken.cl'        },
  { keywords: ['correos de chile', 'correos chile'], domain: 'correos.cl'        },

  // ── Comida rápida cadenas ──────────────────────────────────────────────────
  { keywords: ["mcdonald's", 'mcdonalds', 'mc donalds'], domain: 'mcdonalds.com'  },
  { keywords: ['burger king'],                       domain: 'burgerking.com'    },
  { keywords: ['kfc', 'kentucky'],                   domain: 'kfc.com'           },
  { keywords: ['subway'],                            domain: 'subway.com'        },
  { keywords: ['pizza hut'],                         domain: 'pizzahut.com'      },
  { keywords: ["domino's", 'dominos'],               domain: 'dominos.com'       },
  { keywords: ["papa john's", 'papa johns'],         domain: 'papajohns.com'     },
  { keywords: ['starbucks'],                         domain: 'starbucks.com'     },
  { keywords: ['juan valdez'],                       domain: 'juanvaldezcafe.com'},
  { keywords: ['telepizza', 'tele pizza'],           domain: 'telepizza.cl'      },
  { keywords: ['lomitón', 'lomiton'],                domain: 'lomiton.cl'        },
  { keywords: ['doggis'],                            domain: 'doggis.cl'         },
  { keywords: ['taco bell'],                         domain: 'tacobell.com'      },
  { keywords: ['wendy'],                             domain: 'wendys.com'        },
  { keywords: ['popeyes'],                           domain: 'popeyes.com'       },
  { keywords: ['chilis', "chili's"],                 domain: 'chilis.com'        },
  { keywords: ['frisby'],                            domain: 'frisby.com.co'     },
  { keywords: ['sushi roll'],                        domain: 'sushiroll.com.mx'  },
  { keywords: ['the coffee'],                        domain: 'thecoffeestore.com.co'},
  { keywords: ['emporio la rosa'],                   domain: 'emporioalarosa.com'},

  // ── Bancos / Finanzas (para gastos bancarios) ─────────────────────────────
  { keywords: ['banco estado', 'bancoestado'],       domain: 'bancoestado.cl'    },
  { keywords: ['bci'],                               domain: 'bci.cl'            },
  { keywords: ['banco de chile', 'bancochile'],      domain: 'bancochile.cl'     },
  { keywords: ['santander'],                         domain: 'santander.cl'      },
  { keywords: ['scotiabank'],                        domain: 'scotiabank.cl'     },

  // ── Salud / Seguros ────────────────────────────────────────────────────────
  { keywords: ['banmédica', 'banmedica'],            domain: 'banmedica.cl'      },
  { keywords: ['colmena'],                           domain: 'colmena.cl'        },
  { keywords: ['consalud'],                          domain: 'consalud.cl'       },
  { keywords: ['fonasa'],                            domain: 'fonasa.cl'         },
  { keywords: ['metlife'],                           domain: 'metlife.cl'        },
  { keywords: ['bupa'],                              domain: 'bupa.com'          },
  { keywords: ['gympass', 'wellhub'],                domain: 'wellhub.com'       },

  // ── Educación ─────────────────────────────────────────────────────────────
  { keywords: ['udemy'],                             domain: 'udemy.com'         },
  { keywords: ['coursera'],                          domain: 'coursera.org'      },
  { keywords: ['platzi'],                            domain: 'platzi.com'        },
  { keywords: ['domestika'],                         domain: 'domestika.org'     },
  { keywords: ['preuniversitario pedro'],            domain: 'pedrodearagon.cl'  },

  // ── Entretenimiento ───────────────────────────────────────────────────────
  { keywords: ['cine hoyts', 'hoyts'],               domain: 'hoyts.cl'          },
  { keywords: ['cinemark'],                          domain: 'cinemark.cl'       },
  { keywords: ['cineplanet'],                        domain: 'cineplanet.cl'     },
  { keywords: ['ticketmaster', 'ticket master'],     domain: 'ticketmaster.cl'   },
  { keywords: ['puntoticket', 'punto ticket'],       domain: 'puntoticket.com'   },
  { keywords: ['spotify'],                           domain: 'spotify.com'       },

  // ── Tecnología / Suscripciones ────────────────────────────────────────────
  { keywords: ['chatgpt', 'openai'],                 domain: 'openai.com'        },
  { keywords: ['apple', 'app store', 'itunes'],      domain: 'apple.com'         },
  { keywords: ['google', 'google play'],             domain: 'google.com'        },
  { keywords: ['samsung'],                           domain: 'samsung.com'       },
  { keywords: ['entel hogar'],                       domain: 'entel.cl'          },

  // ── Restaurantes / Locales con dominio conocido ───────────────────────────
  { keywords: ['niu sushi', 'niu'],                  domain: 'niusushi.cl'       },
  { keywords: ['osaka'],                             domain: 'osaka.cl'          },
  { keywords: ['nolita'],                            domain: 'nolita.cl'         },
  { keywords: ['el rapa nui', 'rapa nui'],           domain: 'rapanui.cl'        },
  { keywords: ['fuente alemana'],                    domain: 'fuentealemana.cl'  },
  { keywords: ['dominó', 'domino hamburguer'],       domain: 'domino.cl'         },
]

/** Detecta el dominio automáticamente dado el nombre del servicio */
export function detectDomain(name: string): string | null {
  const lower = name.toLowerCase().trim()
  for (const service of KNOWN_SERVICES) {
    if (service.keywords.some(kw => lower.includes(kw))) {
      return service.domain
    }
  }
  return null
}

// ─── Métodos de pago → dominios ─────────────────────────────────────────────

export const KNOWN_PAYMENT_METHODS: { keywords: string[]; domain: string }[] = [
  // Bancos Chile
  { keywords: ['banco estado', 'bancoestado', 'bechile'],   domain: 'bancoestado.cl'      },
  { keywords: ['bci', 'banco bci'],                         domain: 'bci.cl'              },
  { keywords: ['santander'],                                domain: 'santander.cl'        },
  { keywords: ['banco de chile', 'edwards', 'credichile'],  domain: 'bancochile.cl'       },
  { keywords: ['falabella', 'cmr'],                         domain: 'falabella.com'       },
  { keywords: ['ripley'],                                   domain: 'bancoripley.com'     },
  { keywords: ['scotiabank', 'chek'],                       domain: 'scotiabank.cl'       },
  { keywords: ['bbva'],                                     domain: 'bbva.cl'             },
  { keywords: ['itau', 'itaú'],                             domain: 'itau.cl'             },
  { keywords: ['security', 'banco security'],               domain: 'bancosecurity.cl'    },
  { keywords: ['bice'],                                     domain: 'bice.cl'             },
  { keywords: ['consorcio'],                                domain: 'bancoconsorcio.cl'   },
  { keywords: ['internacional'],                            domain: 'bancointernacional.cl'},
  // Wallets / Digital
  { keywords: ['mach'],                                     domain: 'mach.life'           },
  { keywords: ['tenpo'],                                    domain: 'tenpo.cl'            },
  { keywords: ['mercado pago', 'mercadopago'],              domain: 'mercadopago.cl'      },
  { keywords: ['fintual'],                                  domain: 'fintual.com'         },
  { keywords: ['paypal'],                                   domain: 'paypal.com'          },
  { keywords: ['apple pay'],                                domain: 'apple.com'           },
  { keywords: ['google pay'],                               domain: 'google.com'          },
  { keywords: ['samsung pay'],                              domain: 'samsung.com'         },
  // Redes de tarjetas
  { keywords: ['visa'],                                     domain: 'visa.com'            },
  { keywords: ['mastercard', 'master card'],                domain: 'mastercard.com'      },
  { keywords: ['amex', 'american express'],                 domain: 'americanexpress.com' },
]

/** Mapea el nombre de un servicio a un emoji representativo */
export function nameToEmoji(name: string): string | null {
  const n = name.toLowerCase()
  const map: [string[], string][] = [
    [['netflix', 'disney', 'hbo', 'max', 'amazon prime', 'prime video', 'apple tv', 'youtube', 'paramount', 'crunchyroll', 'mubi', 'star+', 'twitch', 'streaming', 'cine', 'pelicula', 'película'], '🎬'],
    [['spotify', 'apple music', 'tidal', 'deezer', 'musica', 'música'], '🎵'],
    [['gym', 'gimnasio', 'fitness', 'crossfit', 'yoga', 'smartfit'], '💪'],
    [['arriendo', 'alquiler', 'renta', 'casa', 'depto', 'departamento', 'habitacion', 'habitación', 'hogar'], '🏠'],
    [['seguro', 'insurance', 'isapre', 'salud', 'norton', 'mcafee', 'nordvpn', 'expressvpn', 'adt'], '🛡️'],
    [['internet', 'wifi', 'vtr', 'gtd', 'fibra', 'banda ancha'], '🌐'],
    [['telefono', 'teléfono', 'celular', 'movil', 'móvil', 'entel', 'claro', 'movistar', 'wom'], '📱'],
    [['agua', 'esval', 'aguas'], '💧'],
    [['gas', 'gasco', 'metrogas'], '🔥'],
    [['luz', 'electricidad', 'enel', 'cge'], '⚡'],
    [['adobe', 'canva', 'figma', 'diseño'], '🎨'],
    [['microsoft', 'office', 'windows', 'onedrive'], '💻'],
    [['icloud', 'dropbox', 'google one', 'google drive', 'almacenamiento', 'nube'], '☁️'],
    [['juego', 'gaming', 'steam', 'playstation', 'xbox', 'nintendo'], '🎮'],
    [['parking', 'estacionamiento', 'garage'], '🅿️'],
    [['transporte', 'bus', 'metro', 'bip'], '🚌'],
    [['uber', 'cabify', 'taxi'], '🚗'],
    [['educacion', 'educación', 'colegio', 'universidad', 'curso', 'duolingo'], '📚'],
    [['mascota', 'veterinaria', 'perro', 'gato'], '🐾'],
    [['credito', 'crédito', 'prestamo', 'préstamo', 'deuda', 'hipoteca'], '💳'],
    [['openai', 'chatgpt', 'claude', 'notion', 'slack', 'zoom', 'github'], '🤖'],
    [['rappi', 'pedidosya', 'delivery', 'comida'], '🍔'],
    [['audible', 'kindle', 'libro'], '📖'],
    [['tinder', 'bumble', 'citas'], '❤️'],
    [['linkedin'], '💼'],
    [['calm', 'headspace', 'meditacion', 'meditación'], '🧘'],
    [['mercado pago', 'mercadopago', 'paypal', 'mach', 'tenpo', 'fintual'], '💰'],
  ]
  for (const [keywords, emoji] of map) {
    if (keywords.some(k => n.includes(k))) return emoji
  }
  return null
}

/** Detecta el dominio para un método de pago dado su nombre */
export function detectPaymentDomain(name: string): string | null {
  const lower = name.toLowerCase().trim()
  for (const pm of KNOWN_PAYMENT_METHODS) {
    if (pm.keywords.some(kw => lower.includes(kw))) {
      return pm.domain
    }
  }
  return null
}
