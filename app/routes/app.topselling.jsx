import React from 'react';
import { useLoaderData } from 'react-router';
import { authenticate } from '../shopify.server.js';

export const loader = async ({ request }) => {
    const nextpage = null;
    const { admin } = await authenticate.admin(request);

    const response = await admin.graphql(
       `
query getLast7daysOrders($nextpage:String) {
  orders(first:250, after: $nextpage, query: "created_at:>=2026-02-01") {
    edges {
      node {
        id
        name
        
        createdAt
        updatedAt
        processedAt
        displayFinancialStatus
        displayFulfillmentStatus
  
    
        lineItems(first: 250) {
          edges {
            node {
              id
              name
              isGiftCard
              title
              quantity
            }
          }
        }
        
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`,
        {
            variables: {
                nextpage: nextpage
        }
        }
    )


    let data = await response.json();
    console.log(data);
    return data;
}



export default function TopSellingProducts() {
    const data = useLoaderData();
    console.log(data);
    return (
        <div>
            <h1>Top Selling Products</h1>
            <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
    )
}

