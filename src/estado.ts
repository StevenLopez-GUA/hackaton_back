// COMPARTIDO. Estado en memoria. Arranca con el fixture; POST /upload lo reemplaza con setDataset().
import { cargarDatasetFixture } from "./fixtures";
import type { Dataset } from "./types";

let dataset: Dataset = cargarDatasetFixture();

export const getDataset = (): Dataset => dataset;
export const setDataset = (d: Dataset): void => {
  dataset = d;
};
