const { point, bearingToAzimuth } = require('@turf/helpers');
const sector = require('@turf/sector');
const { readFileSync, writeFileSync } = require('node:fs');
const {convert} = require('geojson2shp');
const axios = require('axios');

const get_bearing_angle = value => {
  if (value <= -180) {
    return value + 360;
  }
  if (value > 180) {
    return value - 360;
  }
  return value;
};

const read_csv_data = async filename => {
  const csv_data = readFileSync(filename, 'utf8');
  const data_rows = csv_data?.split(/\n|\r\n/);
  const header_row = data_rows[0];
  const headers = header_row?.split(',');
  const data = [];
  for (let row_id = 1; row_id < data_rows?.length; row_id++) {
    const info_arr = data_rows[row_id]?.split(',');
    const info = {};
    for (let col_id = 0; col_id < headers?.length; col_id++) {
      const entry = Number(info_arr[col_id]) ? Number(info_arr[col_id]) : info_arr[col_id];
      info[headers[col_id]] = entry
    }
    data?.push(info);
  }
  return data;
};

// https://github.com/fxdawnn/early-fire-detection/blob/main/website/viewshed.js
const get_topo_viewshed = async info => {
  console.log(info);
  const vs = await axios.get('http://34.133.228.94:8080/viewshed_geojson', {
    params: info
  });
  return vs?.data;
};

const evaluate = async filename => {
  const data = await read_csv_data(filename);
  const viewsheds_geojsons = [];
  for (const info of data) {
    const { latitude, longitude, horizontal_pose, horizontal_fov } = info;
    const fov_diff = horizontal_fov / 2;
    const bearing_1 = bearingToAzimuth(get_bearing_angle(horizontal_pose - fov_diff));
    const bearing_2 = bearingToAzimuth(get_bearing_angle(horizontal_pose + fov_diff));
    const viewshed_geojson = await get_topo_viewshed({
      lat: latitude,
      lng: longitude,
      hor_start: bearing_1, // 0-360 degrees clockwise. North is 0
      hor_end: bearing_2, // 0-360 degrees clockwise. North is 0
      distance: 5 //kms
    });
    viewsheds_geojsons?.push(viewshed_geojson);
  }

  // generate geojson csv
  const geojson_file_content = ['geojson', ...viewsheds_geojsons]?.map(geojson => JSON.stringify(geojson))?.join("\n");
  writeFileSync('geojson.csv', geojson_file_content);

  // create shapefile
  const geojson_collection = {
    type: 'FeatureCollection',
    features: viewsheds_geojsons
  };
  await convert(geojson_collection, 'viewshade_shapefile.zip', {
    layer: 'viewshades',
    targetCrs: 2154
  })
};

evaluate('camera_loc.csv');