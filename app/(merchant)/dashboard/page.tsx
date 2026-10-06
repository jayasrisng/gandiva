import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { db, checked } from "@/lib/products/repository";
export default async function Dashboard() {
  const owner = await requireOwner();
  const products = checked(
    await db()
      .from("products")
      .select("*")
      .eq("owner_id", owner)
      .order("created_at", { ascending: false }),
  );
  const assets = checked(
    await db()
      .from("product_assets")
      .select("*")
      .eq("owner_id", owner)
      .eq("kind", "original")
      .order("created_at"),
  );
  const images = new Map<string, string>();
  for (const asset of assets)
    if (!images.has(asset.product_id)) {
      const { data } = await db()
        .storage.from(asset.bucket)
        .createSignedUrl(asset.path, 3600);
      if (data) images.set(asset.product_id, data.signedUrl);
    }
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">YOUR PRODUCT WORKSPACE</p>
          <h1>From source to certainty.</h1>
          <p>
            Review truth, create an image, and keep a record of every decision.
          </p>
        </div>
        <Link className="button" href="/products/new">
          ＋ Add product
        </Link>
      </header>
      <div className="stats">
        <div>
          <strong>{products.length}</strong>
          <span>Products</span>
        </div>
        <div>
          <strong>
            {products.filter((p) => p.status === "approved").length}
          </strong>
          <span>Approved</span>
        </div>
        <div>
          <strong>
            {products.filter((p) => p.status !== "approved").length}
          </strong>
          <span>In progress</span>
        </div>
      </div>
      {products.length ? (
        <section className="product-grid">
          {products.map((product) => (
            <Link
              className="product-card"
              key={product.id}
              href={`/products/${product.id}`}
            >
              <div className="product-photo">
                {images.get(product.id) ? (
                  <img src={images.get(product.id)} alt={product.name} />
                ) : (
                  <span>No preview</span>
                )}
                <span className="badge">
                  {product.status.replaceAll("_", " ")}
                </span>
              </div>
              <div>
                <small>{product.category}</small>
                <h2>{product.name}</h2>
                <span>Open product record ↗</span>
              </div>
            </Link>
          ))}
        </section>
      ) : (
        <section className="empty">
          <span className="empty-symbol">◈</span>
          <h2>Your first product starts here.</h2>
          <p>
            Bring a few real photos and describe the product in your own words.
            <br />
            Telugu, English, and mixed speech are welcome.
          </p>
          <Link className="button" href="/products/new">
            Capture a product ↗
          </Link>
        </section>
      )}
    </>
  );
}
