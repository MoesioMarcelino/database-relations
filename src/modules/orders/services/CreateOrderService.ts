import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError("Customer doesn't exists");
    }

    const existingProducts = await this.productsRepository.findAllById(
      products,
    );

    if (!existingProducts.length) {
      throw new AppError('Could not find any products with the given ids');
    }

    const existingProductsIds = existingProducts.map(product => product.id);

    const checkInexistentProducts = products.filter(
      product => !existingProductsIds.includes(product.id),
    );

    if (checkInexistentProducts.length) {
      throw new AppError(
        "One or more products doesn't exists. Register all them before to done the shop",
      );
    }

    const findProductsWithQuantityUnvailable = products.filter(product => {
      return (
        existingProducts.filter(p => p.id === product.id)[0].quantity <
        product.quantity
      );
    });

    if (findProductsWithQuantityUnvailable.length) {
      throw new AppError("One or more products don't have a valid quantity");
    }

    const serializedProducts = products.map(({ id, quantity }) => ({
      product_id: id,
      quantity,
      price: existingProducts.filter(product => product.id === id)[0].price,
    }));

    const order = await this.ordersRepository.create({
      customer,
      products: serializedProducts,
    });

    const { order_products } = order;

    const orderedProductsQuantity = order_products.map(product => ({
      id: product.product_id,
      quantity:
        existingProducts.filter(p => p.id === product.product_id)[0].quantity -
        product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
