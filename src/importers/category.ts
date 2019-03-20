import Instance from '@spree/storefront-api-v2-sdk/types/Instance'
import { JsonApiDocument } from '../interfaces'
import { getCategories, getCategoriesOnPath, logger } from '../utils'

const convertToESCategories = (categories) => {
  return categories.map((category: JsonApiDocument) => {
    const relationships = category.relationships

    const getChildrenProps = (categoryNode) => {
      const children = categoryNode.relationships.children.data.map((childRef) => {
        const child = categories.find((candidateChildCategory) => candidateChildCategory.id === childRef.id)

        return {
          id: +childRef.id,
          ...getChildrenProps(child)
        }
      })

      if (children.length === 0) {
        return {}
      }

      return {
        children_count: children.length,
        children_data: children
      }
    }

    return {
      ...getChildrenProps(category),
      id: +category.id,
      is_active: true,
      level: category.attributes.depth + 2,
      name: category.attributes.name,
      // default value for parent_id must be an id not generated by Spree
      parent_id: relationships.parent.data && +relationships.parent.data.id || -42,
      path: getCategoriesOnPath(categories, [category.id]).map(({id}) => id).join('/'),
      position: category.attributes.position,
      product_count: relationships.products.data.length,
      url_key: category.attributes.permalink
    }
  })
}

const importCategories = (
  spreeClient: Instance, getElasticBulkQueue: any, preconfigMapPages: any
): void => {
  getCategories(spreeClient, preconfigMapPages)
    .then((categories) => {
      logger.info('Downloaded categories from Spree, converting to ES format')
      const convertedCategories = convertToESCategories(categories)

      convertedCategories.map((category) => {
        getElasticBulkQueue.pushIndex('category', category)
      })

      return getElasticBulkQueue.flush()
        .then(({ errors }) => {
          if (errors.length > 0) {
            logger.error(['Some or all ES operations failed.', errors])
          } else {
            logger.info('Categories imported')
          }
        })
        .catch((error) => {
          logger.error(['Could not import category', error])
        })
    })
    .catch(logger.error)
}

export default importCategories
