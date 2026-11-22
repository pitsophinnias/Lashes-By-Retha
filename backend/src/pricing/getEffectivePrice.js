// The single place that decides what a product (or one of its options)
// actually costs right now. Every list, cart, checkout and order-creation
// route calls this instead of reading price/salePrice itself, so a sale
// always shows and charges the same amount everywhere.
//
// `product` and `option` are raw DB rows (snake_case). `option` is a
// product_variants or product_options row, or omitted/null for a product
// with no options - in both cases the normal price always comes from the
// product; only the sale fields (sale_price/on_sale) come from the option
// when one is given, since options never carry their own normal price.
const round2 = (n) => Math.round(n * 100) / 100

const getEffectivePrice = (product, option) => {
  const originalPrice = parseFloat(product.price)
  const source = option || product
  const onSale = !!source.on_sale
  const rawSalePrice = source.sale_price
  const salePrice = rawSalePrice !== null && rawSalePrice !== undefined ? parseFloat(rawSalePrice) : null

  if (onSale && salePrice !== null && !isNaN(salePrice)) {
    return { price: salePrice, originalPrice, onSale: true, saveAmount: round2(originalPrice - salePrice) }
  }
  return { price: originalPrice, originalPrice, onSale: false, saveAmount: 0 }
}

// A sale price must be a genuine discount - more than nothing, and
// strictly less than the price it's discounting from. Returns an error
// string, or null when valid.
const validateSalePrice = (salePrice, normalPrice) => {
  const price = parseFloat(salePrice)
  if (salePrice === undefined || salePrice === null || salePrice === '' || isNaN(price)) {
    return 'A sale price is required.'
  }
  if (price <= 0) return 'Sale price must be greater than R0.'
  if (price >= parseFloat(normalPrice)) return 'Sale price must be less than the normal price.'
  return null
}

// The cheapest a product can currently be bought for, across its options
// (or its own price when it has none) - used for the marketplace card's
// "From R X" when only some options are on sale.
const getLowestEffectivePrice = (product, options) => {
  if (!options || options.length === 0) return getEffectivePrice(product)
  return options.reduce((lowest, o) => {
    const effective = getEffectivePrice(product, o)
    return effective.price < lowest.price ? effective : lowest
  }, getEffectivePrice(product, options[0]))
}

module.exports = { getEffectivePrice, validateSalePrice, getLowestEffectivePrice }
